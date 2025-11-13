import { useState, useEffect } from 'react';
import { api } from './services/api';
import Dashboard from './components/Dashboard';
import TokenList from './components/TokenList';
import RecentTransactions from './components/RecentTransactions';
import ApiKeyPrompt from './components/ApiKeyPrompt';

function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if API key is stored
    const storedKey = localStorage.getItem('safeguard_api_key');
    if (storedKey) {
      setApiKey(storedKey);
      api.setApiKey(storedKey);
      verifyApiKey(storedKey);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyApiKey = async (key: string) => {
    try {
      await api.getHealth();
      setIsAuthenticated(true);
      setLoading(false);
    } catch (error) {
      console.error('Invalid API key:', error);
      localStorage.removeItem('safeguard_api_key');
      setIsAuthenticated(false);
      setLoading(false);
    }
  };

  const handleApiKeySubmit = async (key: string) => {
    setLoading(true);
    setApiKey(key);
    api.setApiKey(key);

    try {
      await api.getHealth();
      localStorage.setItem('safeguard_api_key', key);
      setIsAuthenticated(true);
    } catch (error) {
      alert('Invalid API key. Please try again.');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('safeguard_api_key');
    setApiKey('');
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ApiKeyPrompt onSubmit={handleApiKeySubmit} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🛡️ Safeguard Bot</h1>
              <p className="text-sm text-gray-500">Community Protection & Analytics</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Dashboard Overview */}
          <Dashboard />

          {/* Tracked Tokens */}
          <TokenList />

          {/* Recent Transactions */}
          <RecentTransactions />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            Built with ❤️ for the crypto community
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
