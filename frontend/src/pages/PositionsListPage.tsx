import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, FileText, AlertCircle, Loader2, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { trpc } from '../services/api';
import { useAuthStore } from '../stores/authStore';

/**
 * PositionsListPage - Lista radnih mesta sa opcijama za kreiranje
 *
 * Prikazuje:
 * - Dugme za ručno kreiranje pozicije (otvara PositionWizard)
 * - Dugme za upload dokumenta (OCR ekstrakcija)
 * - Lista postojećih pozicija
 */
export function PositionsListPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  // Document generation mutation
  const generateDocMutation = trpc.documents.generate.useMutation({
    onSuccess: (data) => {
      setGeneratingId(null);
      window.open(data.url, '_blank');
    },
    onError: (err) => {
      setGeneratingId(null);
      setUploadStatus('error');
      setUploadMessage(err.message);
    },
  });

  const handleGenerateDocument = (positionId: number) => {
    setGeneratingId(positionId);
    setUploadStatus('idle');
    generateDocMutation.mutate({ positionId });
  };

  // Fetch user's companies
  const { data: companies, isLoading: companiesLoading } = trpc.companies.list.useQuery();

  // Fetch positions for selected company
  const { data: positionsData, isLoading: positionsLoading } = trpc.positions.listByCompany.useQuery(
    { companyId: selectedCompanyId!, page: 1, pageSize: 50 },
    { enabled: selectedCompanyId !== null }
  );

  // Set default company when companies load
  if (companies && companies.length > 0 && selectedCompanyId === null) {
    setSelectedCompanyId(companies[0]!.id);
  }

  const handleManualCreate = () => {
    navigate('/app/positions/new');
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
      setUploadStatus('error');
      setUploadMessage('Неподржан формат. Дозвољени: PDF, DOCX, PNG, JPG');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadStatus('error');
      setUploadMessage('Фајл је превелик (максимум 10MB)');
      return;
    }

    setUploadStatus('uploading');
    setUploadMessage('Отпремање фајла...');

    try {
      // Get auth token
      const authState = useAuthStore.getState();
      const token = authState.accessToken;

      if (!token) {
        throw new Error('Морате бити пријављени. Молимо вас да се поново улогујете.');
      }

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);

      // Upload to backend
      const response = await fetch('http://localhost:3000/api/documents/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired - logout user
          useAuthStore.getState().logout();
          throw new Error('Сесија је истекла. Молимо вас да се поново улогујете.');
        }
        const errorData = await response.json().catch(() => ({ error: 'Непозната грешка' }));
        throw new Error(errorData.error || 'Грешка при отпремању');
      }

      const data = await response.json();
      const documentId = data.fileId;

      setUploadStatus('processing');
      setUploadMessage('AI екстракција је у току... Ово може потрајати 30-60 секунди.');

      // Poll for extraction results from backend
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max

      const pollInterval = setInterval(async () => {
        attempts++;

        try {
          // Query backend for document status using tRPC
          const docStatus = await trpc.documents.getUploadedById.query({ documentId });

          // Check if processing is complete
          if (docStatus.processingStatus === 'completed' && docStatus.extractedData) {
            clearInterval(pollInterval);

            const extracted = docStatus.extractedData as any;
            const positionsCount = extracted.createdPositionIds?.length || extracted.positions?.length || 0;
            const workersCount = extracted.createdWorkerIds?.length || extracted.employees?.length || 0;

            setUploadStatus('success');
            setUploadMessage(`Успешно извучено! ${positionsCount} радних места, ${workersCount} радника.`);

            // Reset after 5 seconds
            setTimeout(() => {
              setUploadStatus('idle');
              setUploadMessage('');
              // Refresh positions list
              window.location.reload();
            }, 5000);
          } else if (docStatus.processingStatus === 'failed') {
            clearInterval(pollInterval);
            setUploadStatus('error');
            setUploadMessage(docStatus.processingError || 'AI обрада није успела');
          }

          // Timeout after max attempts
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setUploadStatus('error');
            setUploadMessage('AI обрада траје предуго (timeout). Проверите документе страницу.');
          }
        } catch (error) {
          console.error('Poll error:', error);
          // Continue polling on error, but stop after max attempts
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setUploadStatus('error');
            setUploadMessage('Грешка при провери статуса');
          }
        }
      }, 1000);

    } catch (error) {
      setUploadStatus('error');
      setUploadMessage(error instanceof Error ? error.message : 'Грешка при отпремању фајла');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Радна места</h1>
            <p className="text-muted-foreground mt-1">
              Креирајте радна места ручно или отпремањем документа
            </p>
          </div>
        </div>

        {/* Company Selector */}
        {companies && companies.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Изаберите предузеће</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedCompanyId || ''}
                onChange={(e) => setSelectedCompanyId(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}

        {/* Upload Status */}
        {uploadStatus !== 'idle' && (
          <Alert variant={uploadStatus === 'error' ? 'destructive' : 'default'}>
            {uploadStatus === 'uploading' && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploadStatus === 'processing' && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploadStatus === 'error' && <AlertCircle className="h-4 w-4" />}
            <AlertDescription>{uploadMessage}</AlertDescription>
          </Alert>
        )}

        {/* Action Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Manual Create */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={handleManualCreate}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Ручно креирање</CardTitle>
                  <CardDescription>
                    Унесите податке о радном месту корак по корак
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={handleManualCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Креирај ново радно место
              </Button>
            </CardContent>
          </Card>

          {/* Upload Document */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={handleUploadClick}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <CardTitle>Отпреми документ</CardTitle>
                  <CardDescription>
                    AI ће аутоматски извући податке из PDF-а
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={handleUploadClick}>
                <Upload className="mr-2 h-4 w-4" />
                Отпреми PDF или слику
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground mt-2 text-center">
                PDF, DOCX, PNG, JPG (макс. 10MB)
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Positions List */}
        {selectedCompanyId && (
          <Card>
            <CardHeader>
              <CardTitle>Постојећа радна места</CardTitle>
              <CardDescription>
                {positionsData ? `${positionsData.total} радних места` : 'Учитавање...'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {positionsLoading && (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground mt-2">Учитавање...</p>
                </div>
              )}

              {!positionsLoading && positionsData && positionsData.positions.length === 0 && (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    Још увек немате креирана радна места
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Креирајте ново радно место кликом на дугме изнад
                  </p>
                </div>
              )}

              {!positionsLoading && positionsData && positionsData.positions.length > 0 && (
                <div className="space-y-3">
                  {positionsData.positions.map((position) => (
                    <div
                      key={position.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <h3 className="font-medium">{position.positionName}</h3>
                        {position.department && (
                          <p className="text-sm text-muted-foreground">{position.department}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {(position.maleCount ?? 0) + (position.femaleCount ?? 0)} запослених
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateDocument(position.id)}
                          disabled={generatingId === position.id}
                        >
                          {generatingId === position.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Download className="h-4 w-4 mr-1" />
                          )}
                          Генериши документ
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/app/positions/${position.id}`)}
                        >
                          Детаљи
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* No Company Warning */}
        {!companiesLoading && (!companies || companies.length === 0) && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Морате прво креирати предузеће пре него што можете додати радна места.
              <Button
                variant="link"
                className="ml-2 p-0 h-auto"
                onClick={() => navigate('/app/company')}
              >
                Креирајте предузеће →
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </DashboardLayout>
  );
}
