import axios, { AxiosInstance } from 'axios';

class ApiService {
  private client: AxiosInstance;
  private apiKey: string = '';

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_URL || '/api',
      timeout: 10000,
    });

    // Add API key to all requests
    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers['X-API-Key'] = this.apiKey;
      }
      return config;
    });
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async getHealth() {
    const { data } = await axios.get('/health');
    return data;
  }

  async getDashboard() {
    const { data } = await this.client.get('/dashboard');
    return data.data;
  }

  async getTokens(params?: { chain?: string; groupId?: string }) {
    const { data } = await this.client.get('/tokens', { params });
    return data.data;
  }

  async getTokenStats(tokenId: string) {
    const { data } = await this.client.get(`/tokens/${tokenId}/stats`);
    return data.data;
  }

  async getTransactions(params?: {
    tokenId?: string;
    chain?: string;
    type?: string;
    limit?: number;
  }) {
    const { data } = await this.client.get('/transactions', { params });
    return data.data;
  }

  async getDailyStats(params?: {
    chain?: string;
    tokenAddress?: string;
    days?: number;
  }) {
    const { data } = await this.client.get('/stats/daily', { params });
    return data.data;
  }

  async getGroups() {
    const { data } = await this.client.get('/groups');
    return data.data;
  }
}

export const api = new ApiService();
