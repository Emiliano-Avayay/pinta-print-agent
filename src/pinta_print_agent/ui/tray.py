"""Small pystray wrapper. The worker stays on its own thread."""
from pathlib import Path
import os, logging
class AgentTray:
    def __init__(self, worker, printer, renderer, paths): self.worker=worker; self.printer=printer; self.renderer=renderer; self.paths=paths; self.icon=None
    def _open(self,path):
        if os.name=="nt": os.startfile(str(path))
    def run(self):
        import pystray
        from PIL import Image, ImageDraw
        image=Image.new("RGB",(64,64),"#202020"); d=ImageDraw.Draw(image); d.rectangle((10,10,54,54),outline="#f5c542",width=5); d.line((18,32,46,32),fill="#f5c542",width=5)
        menu=pystray.Menu(lambda: pystray.MenuItem("Pinta Print Agent",None,enabled=False), lambda: pystray.MenuItem(f"Estado: {self.worker.state.value}",None,enabled=False), lambda: pystray.MenuItem(f"Servidor: {self.worker.server_state.value}",None,enabled=False), lambda: pystray.MenuItem(f"Impresora: {self.printer.check_status().value}",None,enabled=False), lambda: pystray.MenuItem(f"Ultimo pedido: {self.worker.last_order_number or '-'}",None,enabled=False), pystray.Menu.SEPARATOR, pystray.MenuItem("Abrir logs",lambda *_:self._open(self.paths.logs)),pystray.MenuItem("Abrir impresiones mock",lambda *_:self._open(self.paths.mock_output)),pystray.MenuItem("Salir",lambda *_:self.stop()))
        self.icon=pystray.Icon("PintaPrintAgent",image,"Pinta Print Agent",menu); self.icon.run()
    def stop(self):
        self.worker.stop()
        if self.icon:self.icon.stop()
