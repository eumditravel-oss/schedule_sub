async function main() {
  try {
    const res = await fetch('https://concost-dev-scheduler-qa.eumditravel.workers.dev/api/projects');
    const json = await res.json();
    console.log('QA Projects:', json.data ? json.data.map(p => ({ id: p.id, name: p.name_ko || p.name })) : json);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
main();
