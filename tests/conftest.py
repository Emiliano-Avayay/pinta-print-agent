import json
import pytest
from pinta_print_agent.config import config_from_dict
@pytest.fixture
def config():
    return config_from_dict({"server":{"base_url":"http://localhost:3000","agent_token":"secret-token","connect_timeout_seconds":1,"read_timeout_seconds":1,"idle_delay_seconds":0.001,"error_backoff_initial_seconds":0.001,"error_backoff_max_seconds":0.002,"verify_tls":True},"printer":{"mode":"mock","name":"","paper_width_chars":42},"agent":{"agent_name":"pinta-kitchen-01","location_id":"pinta-main","health_interval_seconds":1,"log_level":"INFO"}})
