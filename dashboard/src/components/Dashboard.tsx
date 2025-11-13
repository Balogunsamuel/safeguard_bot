import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface DashboardData {
  overview: {
    totalGroups: number;
    totalVerifiedUsers: number;
    totalTrackedTokens: number;
    totalTransactions: number;
  };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const dashboardData = await api.getDashboard();
      setData(dashboardData);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!data) {
    return <div className="text-center py-8 text-red-600">Failed to load dashboard</div>;
  }

  const stats = [
    {
      name: 'Total Groups',
      value: data.overview.totalGroups,
      icon: '👥',
      color: 'bg-blue-500',
    },
    {
      name: 'Verified Users',
      value: data.overview.totalVerifiedUsers,
      icon: '✅',
      color: 'bg-green-500',
    },
    {
      name: 'Tracked Tokens',
      value: data.overview.totalTrackedTokens,
      icon: '💎',
      color: 'bg-purple-500',
    },
    {
      name: 'Total Transactions',
      value: data.overview.totalTransactions,
      icon: '📊',
      color: 'bg-orange-500',
    },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Dashboard Overview</h2>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${stat.color} rounded-md p-3 text-2xl`}>
                  {stat.icon}
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {stat.name}
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stat.value.toLocaleString()}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
