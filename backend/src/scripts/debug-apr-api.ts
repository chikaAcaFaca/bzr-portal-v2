/**
 * Debug APR API response structure
 */
import 'dotenv/config';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const APR_API_URL = 'https://openapi.apr.gov.rs/api/opendata/companies';

async function main() {
  console.log('Fetching APR API...');

  const response = await fetch(APR_API_URL, {
    headers: { 'Accept': 'application/json' },
  });

  console.log('Status:', response.status);
  console.log('Content-Type:', response.headers.get('content-type'));

  const text = await response.text();
  console.log('Response length:', text.length, 'chars');
  console.log('\nFirst 2000 chars:');
  console.log(text.substring(0, 2000));

  // Try to parse
  try {
    const data = JSON.parse(text);

    if (Array.isArray(data)) {
      console.log('\n--- ARRAY ---');
      console.log('Length:', data.length);
      console.log('First item:', JSON.stringify(data[0], null, 2));
      if (data[1]) console.log('Second item:', JSON.stringify(data[1], null, 2));
    } else if (typeof data === 'object') {
      const keys = Object.keys(data);
      console.log('\n--- OBJECT ---');
      console.log('Top-level keys count:', keys.length);
      console.log('First 5 keys:', keys.slice(0, 5));
      console.log('First value:', JSON.stringify(data[keys[0]], null, 2));
      if (keys[1]) console.log('Second key:', keys[1], '=', JSON.stringify(data[keys[1]], null, 2));
    }
  } catch (e) {
    console.log('Failed to parse JSON:', e);
  }
}

main().catch(console.error);
