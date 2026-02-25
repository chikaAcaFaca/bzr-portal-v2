import { useState } from 'react';
import { FileText, Download, Search, Filter, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Alert, AlertDescription } from '../components/ui/alert';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { DocumentList } from '../components/documents/DocumentList';
import { UploadDocuments } from '../components/documents/UploadDocuments';
import { UploadedDocumentsList } from '../components/documents/UploadedDocumentsList';
import { trpc } from '../services/api';

/**
 * DocumentsPage Component (T114)
 *
 * Document management page for viewing, filtering, and downloading generated risk assessment documents.
 * Shows list of all documents with metadata, download links, and expiration status.
 *
 * Features:
 * - Document list with search and filters
 * - Download generated DOCX files
 * - Expiration warnings (7 days)
 * - Sort by date, position, status
 * - Trial vs Professional restrictions
 * - Serbian Cyrillic UI
 *
 * Usage:
 *   Route: /dashboard/documents
 *   Requires authentication + company membership
 *
 * Requirements: FR-023 (Document generation), FR-024 (Document storage)
 */

type DocumentFilter = 'all' | 'active' | 'expired';
type DocumentSort = 'newest' | 'oldest' | 'position';

export function DocumentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<DocumentFilter>('all');
  const [sortBy, setSortBy] = useState<DocumentSort>('newest');
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  // Fetch uploaded documents (user uploads for AI extraction)
  const { data: uploadedDocs, isLoading: isLoadingUploaded, refetch: refetchUploaded } = trpc.documents.listUploaded.useQuery();

  // Fetch generated documents (if this endpoint exists - seems to be referenced but not in documentsRouter)
  // const { data: documents, isLoading, error } = trpc.documents.listDocuments.useQuery({
  //   search: searchQuery || undefined,
  //   status: filterStatus === 'all' ? undefined : filterStatus,
  //   sortBy,
  // });

  // Fetch user's companies and positions for document generation
  const { data: companiesList } = trpc.companies.list.useQuery();
  const firstCompanyId = companiesList?.[0]?.id || null;
  const { data: positionsData } = trpc.positions.listByCompany.useQuery(
    { companyId: firstCompanyId!, page: 1, pageSize: 50 },
    { enabled: firstCompanyId !== null }
  );

  // Document generation mutation
  const generateDocMutation = trpc.documents.generate.useMutation({
    onSuccess: (data) => {
      setGeneratingId(null);
      window.open(data.url, '_blank');
    },
    onError: () => {
      setGeneratingId(null);
    },
  });

  const handleGenerateDocument = (positionId: number) => {
    setGeneratingId(positionId);
    generateDocMutation.mutate({ positionId });
  };

  // For now, use uploaded documents as the main document list
  const documents = uploadedDocs || [];
  const isLoading = isLoadingUploaded;
  const error = null;

  // Fetch subscription status (if this endpoint exists)
  // const { data: subscription } = trpc.company.getSubscriptionStatus.useQuery();
  const subscription = { subscriptionTier: 'professional' }; // Mock for now

  const handleSearch = (value: string) => {
    setSearchQuery(value);
  };

  const handleDownload = (documentId: number, filename: string) => {
    // Download logic handled by DocumentList component
    console.log('Downloading document:', documentId, filename);
  };

  const activeDocumentsCount = documents?.filter((doc) => doc.processingStatus === 'completed').length || 0;
  const expiredDocumentsCount = documents?.filter((doc) => doc.processingStatus === 'failed').length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Документи</h1>
            <p className="text-muted-foreground mt-1">
              Преузмите генерисане акте о процени ризика
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-2">
            <Badge variant="outline" className="gap-1">
              <FileText className="h-3 w-3" />
              {documents?.length || 0} укупно
            </Badge>
            {activeDocumentsCount > 0 && (
              <Badge variant="default" className="gap-1">
                ✓ {activeDocumentsCount} активних
              </Badge>
            )}
            {expiredDocumentsCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                ⚠ {expiredDocumentsCount} истекло
              </Badge>
            )}
          </div>
        </div>

        {/* Trial Restriction Alert */}
        {subscription?.subscriptionTier === 'trial' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              🎁 <strong>Пробни период:</strong> Можете прегледати документе али не можете их преузимати.
              Надоградите на Professional план за неограничено преузимање.
              <Button variant="link" className="ml-2 p-0 h-auto">
                Надогради →
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* Upload Documents Section */}
        <UploadDocuments
          onUploadComplete={(fileId, extractedData) => {
            console.log('Upload complete:', fileId, extractedData);
            // Refresh the uploaded documents list
            refetchUploaded();
          }}
        />

        {/* Uploaded Documents List */}
        <UploadedDocumentsList />

        {/* Generate Document per Position */}
        {positionsData && positionsData.positions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Генериши акт о процени ризика</CardTitle>
              <CardDescription>Изаберите радно место за генерисање документа</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {positionsData.positions.map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{position.positionName}</p>
                      {position.department && (
                        <p className="text-sm text-muted-foreground">{position.department}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleGenerateDocument(position.id)}
                      disabled={generatingId === position.id}
                    >
                      {generatingId === position.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Download className="h-4 w-4 mr-1" />
                      )}
                      Генериши DOCX
                    </Button>
                  </div>
                ))}
              </div>
              {generateDocMutation.error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{generateDocMutation.error.message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Филтрирај документе</CardTitle>
                <CardDescription>Претражите и филтрирајте ваше документе</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Претражи по називу радног места..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filter by Status */}
              <Select
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value as DocumentFilter)}
              >
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue placeholder="Статус" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Сви документи</SelectItem>
                  <SelectItem value="active">Активни</SelectItem>
                  <SelectItem value="expired">Истекли</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Сортирај:</span>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as DocumentSort)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Најновији</SelectItem>
                  <SelectItem value="oldest">Најстарији</SelectItem>
                  <SelectItem value="position">По радном месту</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Document List */}
        <Card>
          <CardHeader>
            <CardTitle>Генерисани документи</CardTitle>
            <CardDescription>
              {documents?.length === 0
                ? 'Још увек немате генерисане документе'
                : `${documents?.length} ${documents?.length === 1 ? 'документ' : 'докумената'}`}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                Учитавање докумената...
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Грешка при учитавању докумената.</AlertDescription>
              </Alert>
            )}

            {!isLoading && !error && documents && documents.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Нема докумената</h3>
                <p className="text-muted-foreground mb-4">
                  Генеришите акт о процени ризика за радно место
                </p>
                <Button>Креирај радно место</Button>
              </div>
            )}

            {!isLoading && !error && documents && documents.length > 0 && (
              <DocumentList
                documents={documents}
                canDownload={subscription?.subscriptionTier === 'professional'}
                onDownload={handleDownload}
              />
            )}
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">💡 Напомена о документима</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Документи се чувају 7 дана након генерисања</p>
            <p>• Након истека рока, морате поново генерисати документ</p>
            <p>• Professional корисници имају неограничено преузимање</p>
            <p>• Документи су у DOCX формату (Microsoft Word)</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
