import express from 'express';

export function setupClustersRoutes(app: express.Application) {
  /**
   * API endpoint for fetching clusters by age and cluster number (proxies to backend service)
   */
  app.get('/api/clusters', async (req, res) => {
    try {
      const backendUrl = process.env['BACKEND_SERVICE'];
      const age = req.query['age'] as string;
      const clusterNumber = req.query['clusterNumber'] as string;
      
      if (!age) {
        return res.status(400).json({
          error: 'age query parameter is required',
          details: 'age must be a number'
        });
      }
      
      if (!clusterNumber) {
        return res.status(400).json({
          error: 'clusterNumber query parameter is required',
          details: 'clusterNumber must be a number'
        });
      }
      
      if (!backendUrl) {
        return res.status(500).json({
          error: 'Backend service URL not configured',
          details: 'BACKEND_SERVICE environment variable is not set'
        });
      }

      const response = await fetch(`${backendUrl}/api/clusters?age=${encodeURIComponent(age)}&clusterNumber=${encodeURIComponent(clusterNumber)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      
      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error proxying clusters request:', error);
      return res.status(500).json({
        error: 'Failed to fetch clusters.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * API endpoint for fetching player cluster data by name (proxies to backend service)
   */
  app.get('/api/clusters/player', async (req, res) => {
    try {
      const backendUrl = process.env['BACKEND_SERVICE'];
      const name = req.query['name'] as string;
      
      if (!name) {
        return res.status(400).json({
          error: 'name query parameter is required',
          details: 'name must be a string'
        });
      }
      
      if (!backendUrl) {
        return res.status(500).json({
          error: 'Backend service URL not configured',
          details: 'BACKEND_SERVICE environment variable is not set'
        });
      }

      const response = await fetch(`${backendUrl}/api/clusters/player?name=${encodeURIComponent(name)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      
      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error proxying player cluster request:', error);
      return res.status(500).json({
        error: 'Failed to fetch player cluster.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
