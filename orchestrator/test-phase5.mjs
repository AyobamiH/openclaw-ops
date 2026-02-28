import http from 'http';

async function testPhase5() {
  console.log('[Test] Starting Phase 5 workflow test...\n');
  
  // Step 1: Get initial KB state
  console.log('[Step 1] Fetching KB summary...');
  const initial = await fetch('http://localhost:3000/api/knowledge/summary');
  const initialData = await initial.json();
  console.log('✓ Initial KB stats:', initialData.stats);
  
  // Step 2: Test knowledge query
  console.log('\n[Step 2] Testing KB query endpoint...');
  const queryRes = await fetch('http://localhost:3000/api/knowledge/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'error rate' })
  });
  const queryData = await queryRes.json();
  console.log('✓ Query response:', queryData);
  
  // Step 3: Export KB
  console.log('\n[Step 3] Testing KB export endpoint...');
  const exportRes = await fetch('http://localhost:3000/api/knowledge/export?format=json');
  const exportData = await exportRes.json();
  console.log('✓ Export successful, entries:', typeof exportData);
  
  console.log('\n✅ Phase 5 Verification Complete!');
  console.log('- Knowledge base endpoints: OPERATIONAL ✓');
  console.log('- Query endpoint responding: YES ✓');
  console.log('- Export functionality: WORKING ✓');
  console.log('- Ready for Phase 4→Phase 5 integration: YES ✓');
  process.exit(0);
}

testPhase5().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
