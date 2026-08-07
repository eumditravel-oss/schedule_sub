# examples/integration/scheduler-client.py
# Python Example Client for CON-COST Dev Scheduler Integration API v1

import os
import requests

BASE_URL = os.getenv('SCHEDULER_API_URL', 'https://concost-dev-scheduler-qa.eumditravel.workers.dev')
API_KEY = os.getenv('SCHEDULER_API_KEY', 'sched_live_example_token')

headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {API_KEY}'
}

# 1. Health Check
resp = requests.get(f'{BASE_URL}/api/integrations/v1/health')
print('Health:', resp.json())

# 2. Upsert Task
payload = {
    'source': 'python-script',
    'external_id': 'py-task-101',
    'project': {
        'external_id': 'concost-hub',
        'name': 'CONCOST-HUB Development'
    },
    'task_name': 'Automated Data Pipeline Task',
    'start_date': '2026-08-15',
    'end_date': '2026-08-18',
    'assignees': [
        {'worker_id': 'wrk_03', 'allocation_percent': 50},
        {'worker_id': 'wrk_04', 'allocation_percent': 50}
    ]
}

upsert_resp = requests.post(f'{BASE_URL}/api/integrations/v1/tasks/upsert', json=payload, headers=headers)
print('Upsert Status:', upsert_resp.status_code)
print('Upsert Result:', upsert_resp.json())
