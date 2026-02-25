/**
 * Dashboard Page (T070)
 *
 * Overview of companies and quick actions.
 * Shows trial banner, summary statistics, and navigation to main features.
 */

import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { trpc } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export function Dashboard() {
  const user = useAuthStore((state) => state.user);

  // Fetch companies using tRPC
  const { data: companies = [], isLoading } = trpc.companies.list.useQuery();

  // Calculate trial days remaining (mock for now - would come from backend)
  const trialDaysRemaining = 14; // TODO: Calculate from user.createdAt

  return (
    <DashboardLayout>
    <div className="space-y-8">
      {/* Trial Banner */}
      {trialDaysRemaining > 0 && trialDaysRemaining <= 14 && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-blue-900">
                Пробни период - Преостало {trialDaysRemaining} дана
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Ваш пробни период истиче за {trialDaysRemaining} дана.
                Надоградите на пуну верзију да наставите да користите све функције.
              </p>
            </div>
            <Button variant="default" className="bg-blue-600 hover:bg-blue-700">
              Надогради
            </Button>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold">БЗР Портал</h1>
        <p className="text-muted-foreground mt-2">
          Систем за израду Акта о процени ризика
        </p>
        {user && (
          <p className="text-sm text-gray-600 mt-1">
            Добродошли, {user.firstName} {user.lastName}!
          </p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Предузећа</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : companies.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Укупан број регистрованих предузећа
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Радна места</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Процењена радна места
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Повећан ризик</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">-</div>
            <p className="text-xs text-muted-foreground">
              Позиција са R &gt; 70
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Документи</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Генерисани Акти
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Брзе акције</CardTitle>
          <CardDescription>
            Започните процену ризика за Ваше предузеће
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Link to="/app/company">
              <Button>Додај предузеће</Button>
            </Link>
            <Link to="/app/positions">
              <Button variant="outline">Управљај радним местима</Button>
            </Link>
            <Link to="/app/risks">
              <Button variant="outline">Процени ризике</Button>
            </Link>
            <Link to="/app/documents">
              <Button variant="secondary">Генериши документ</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity / Companies List */}
      {companies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ваша предузећа</CardTitle>
            <CardDescription>
              {companies.length} {companies.length === 1 ? 'предузеће' : 'предузећа'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {companies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{company.name}</p>
                    <p className="text-sm text-muted-foreground">
                      PIB: {company.pib} | {company.activityCode}
                    </p>
                  </div>
                  <Link to={`/app/company/${company.id}`}>
                    <Button variant="ghost" size="sm">
                      Детаљи →
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && companies.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Добродошли у БЗР Портал!</CardTitle>
            <CardDescription>
              Почните додавањем Вашег предузећа
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Још увек немате регистрована предузећа.
              </p>
              <Link to="/app/company">
                <Button>Додај прво предузеће</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </DashboardLayout>
  );
}
