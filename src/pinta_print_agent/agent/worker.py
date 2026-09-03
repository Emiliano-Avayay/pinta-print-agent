import logging, threading
from ..api import RetryableApiError, AuthApiError, ProtocolApiError, AckConflictError
from ..printer import PrinterError
from ..storage import PayloadMismatchError
from .state import AgentState, ServerState
class AgentWorker(threading.Thread):
    def __init__(self, config, api, printer, renderer, ledger, stop_event=None, sleeper=None, logger=None):
        super().__init__(name="PintaPrintAgentWorker", daemon=False); self.config=config; self.api=api; self.printer=printer; self.renderer=renderer; self.ledger=ledger; self.stop_event=stop_event or threading.Event(); self.sleeper=sleeper or self.stop_event.wait; self.logger=logger or logging.getLogger("pinta_print_agent"); self.state=AgentState.STARTING; self.server_state=ServerState.UNKNOWN; self.last_order_number=None; self.backoff=config.server.error_backoff_initial_seconds
    def _set(self,state): self.state=state; self.logger.info("agent_state=%s",state.value)
    def _wait(self,seconds): self.sleeper(seconds)
    def _retry(self, error, auth=False, protocol=False):
        self.server_state=ServerState.AUTH_ERROR if auth else ServerState.PROTOCOL_ERROR if protocol else ServerState.DISCONNECTED
        self._set(AgentState.AUTH_ERROR if auth else AgentState.PROTOCOL_ERROR if protocol else AgentState.SERVER_ERROR)
        delay=30 if auth else self.backoff; self.logger.warning("API error: %s; retrying in %ss", str(error)[:500], delay); self._wait(delay)
        if not auth and not protocol:self.backoff=min(self.backoff*2,self.config.server.error_backoff_max_seconds)
    def _ack_printed(self,job):
        self._set(AgentState.ACKING); self.logger.info("ACK start job_id=%s",job.job_id)
        try:self.api.ack_printed(job); self.ledger.record_acked(job.job_id,job.claim_token); self.logger.info("ACK success job_id=%s",job.job_id); return True
        except AckConflictError as e: self.ledger.record_ack_error(job.job_id,str(e)); self.logger.warning("ACK conflict job_id=%s",job.job_id); return True
        except (RetryableApiError,AuthApiError,ProtocolApiError) as e: self.ledger.record_ack_error(job.job_id,str(e)); self.logger.warning("ACK failure job_id=%s: %s",job.job_id,str(e)); return False
    def process_one(self, job) -> bool:
        self.last_order_number=job.order.number
        try:
            if self.ledger.already_printed(job):
                self.logger.info("dedupe hit job_id=%s",job.job_id); return self._ack_printed(job)
        except PayloadMismatchError as e:
            self.logger.critical("INTEGRITY ERROR %s",e); self._set(AgentState.ERROR); return False
        self._set(AgentState.PRINTING); self.logger.info("print start job_id=%s order_number=%s",job.job_id,job.order.number)
        try:
            content=self.renderer.render(job.order); self.printer.print_receipt(content,job.order.number,job.job_id); self.ledger.record_printed(job); self.logger.info("print success job_id=%s",job.job_id)
        except PrinterError as e:
            self._set(AgentState.PRINTER_ERROR); self.logger.error("printer failure job_id=%s: %s",job.job_id,str(e)[:500])
            try:self.api.ack_failed(job,"PRINTER_OFFLINE",str(e)[:500])
            except Exception as ack_error:self.logger.warning("failed ACK could not be sent: %s",ack_error)
            return False
        except Exception as e:
            self._set(AgentState.ERROR); self.logger.exception("render/print failure job_id=%s",job.job_id)
            try:self.api.ack_failed(job,"RENDER_ERROR",str(e)[:500])
            except Exception: pass
            return False
        return self._ack_printed(job)
    def run(self):
        self._set(AgentState.STARTING)
        try:
            while not self.stop_event.is_set():
                try:
                    self.server_state=ServerState.CONNECTING; self.api.health(); self.server_state=ServerState.CONNECTED; self.backoff=self.config.server.error_backoff_initial_seconds; self._set(AgentState.RUNNING)
                    while not self.stop_event.is_set():
                        job=self.api.wait_for_print_job(); self.backoff=self.config.server.error_backoff_initial_seconds
                        if job is None: self._set(AgentState.IDLE); self._wait(self.config.server.idle_delay_seconds); continue
                        self.process_one(job)
                        if self.state==AgentState.ERROR: return
                except AuthApiError as e:self._retry(e,auth=True)
                except ProtocolApiError as e:self._retry(e,protocol=True)
                except RetryableApiError as e:self._retry(e)
                except Exception as e:self._retry(e)
        finally:
            self._set(AgentState.STOPPING); self.api.close(); self.ledger.close(); self._set(AgentState.STOPPED)
    def stop(self): self.stop_event.set()
