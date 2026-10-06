const http = require('http');

const API_BASE = 'http://localhost:5000/api/expenditure/ECE';

function makeRequest(url, method, data = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing Expenditure API ---');

  // Test 1: Save Expenditure Data
  const sampleExp = {
    capex: {
      library: { '2025-26': 150000, '2024-25': 120000, '2023-24': 100000 },
      equipment: { '2025-26': 300000, '2024-25': 250000, '2023-24': 200000 },
      workshop: { '2025-26': 80000, '2024-25': 70000, '2023-24': 60000 },
      other_cap: { '2025-26': 40000, '2024-25': 30000, '2023-24': 25000 }
    },
    opex: {
      salaries: { '2025-26': 1200000, '2024-25': 1100000, '2023-24': 1000000 },
      maintenance: { '2025-26': 180000, '2024-25': 150000, '2023-24': 130000 },
      seminars: { '2025-26': 90000, '2024-25': 80000, '2023-24': 70000 }
    }
  };

  const postRes = await makeRequest(API_BASE, 'POST', sampleExp);
  console.log('1. POST Expenditure Data:', postRes);

  // Test 2: GET Expenditure Data
  const getRes = await makeRequest(API_BASE, 'GET');
  console.log('2. GET Expenditure Data:', getRes);

  // Test 3: DELETE Expenditure Data
  const delRes = await makeRequest(API_BASE, 'DELETE');
  console.log('3. DELETE Expenditure Data:', delRes);

  console.log('--- Expenditure API Tests Completed ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
