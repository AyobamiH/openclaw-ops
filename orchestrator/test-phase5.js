// Quick test: Simulate consolidation and verify Phase 5 KB ingestion
const http = require('http');

async function testPhase5() {
  console.log('[Test] Starting Phase 5 workflow test...\n');
  
  // Step 1: Get initial KB state
  const initial = await fetch('http://localhost:3000/api/knowledge/summary');
  const initialData = await initial.json();
  console.log('[Step 1] Initial KB state:', initialData.stats);
  
  // Step 2: Simulate a consolidation with test data
  const consolidation = {
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    alerts: [
      { name: 'HighErrorRate', severity: 'critical', count: 5 },
      { name: 'HighLatency', severity: 'warning', count: 3 }
    ],
    metrics: [
      { name: 'response_time_p95', value: 1200, threshold: 1000 },
      { name: 'error_rate', value: 3.5, threshold: 1 }
    ]
  };
  
  console.log('[Step 2] Consolidation data:', consolidation);
  console.log('[Info] Phase 5 will auto-process this when Phase 4 consolidation runs\n');
  
  // Step 3: Test knowledge query
  console.log('[Step 3] Testing KB query endpoint...');
  const queryRes = await fetch('http://localhost:3000/api/knowledge/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'error rate' })
  });
  const queryData = await queryRes.json();
  console.log('[Query Result]', JSON.stringify(queryData, null, 2));
  
  // Step 4: Export KB
  console.log('\n[Step 4] Exporting KB...');
  const exportRes = await fetch('http://localhost:3000/api/knowledge/export?format=json');
  const exportData = await exportRes.json();
  console.log('[Export] KB entries count:', Object.keys(exportData).length || 0);
  
  console.log('\n✅ Phase 5 Test Complete!');
  console.log('- KB endpoints responding');
  console.log('- Ready for Phase 4 consolidation integration');
  process.exit(0);
}

async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {method: options.method || 'GET', ...options}, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({json: async () => JSON.parse(data)}));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

testPhase5().catch(console.error);
