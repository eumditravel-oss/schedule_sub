// scripts/run-budget-simulation.mjs
process.env.PROXY_PORT = '4180';
process.env.PROXY_REQUEST_BUDGET = '10';
process.env.PROXY_SIMULATION_MODE = 'true';

import('./qa-request-proxy.mjs').then(() => {
  setTimeout(() => {
    import('./test-budget-proxy-simulation.mjs');
  }, 1000);
});
