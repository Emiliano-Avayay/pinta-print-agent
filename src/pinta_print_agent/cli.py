import argparse
from pathlib import Path
from .main import get_config, run, test_print, demo_flow, demo_ack_loss
from .runtime_paths import RuntimePaths
from .logging_setup import configure_logging
def main(argv=None):
    parser=argparse.ArgumentParser(description="Pinta Print Agent")
    parser.add_argument("--runtime-dir",type=Path,help="Development override for LOCALAPPDATA/PintaPrintAgent")
    parser.add_argument("--no-tray",action="store_true"); parser.add_argument("--test-print",action="store_true"); parser.add_argument("--demo-flow",action="store_true"); parser.add_argument("--demo-ack-loss",action="store_true")
    args=parser.parse_args(argv); paths=RuntimePaths.from_root(args.runtime_dir) if args.runtime_dir else RuntimePaths.default(); paths.ensure()
    if not (args.test_print or args.demo_flow or args.demo_ack_loss) and not paths.config.exists():
        parser.error(f"Missing local configuration: copy config/config.example.json to {paths.config}")
    config=get_config(paths); logger=configure_logging(paths,config.agent.log_level)
    if args.test_print: print(f"Test print complete: {test_print(paths,config,logger)} mock print(s)"); return
    if args.demo_flow:
        count,acks=demo_flow(paths,config,logger); print(f"Demo flow complete: {count} mock print(s), {len(acks)} ACK(s)"); return
    if args.demo_ack_loss:
        count,acks=demo_ack_loss(paths,config,logger); print(f"Demo ACK loss complete: {count} mock print(s), {len(acks)} ACK(s)"); return
    run(config,paths,args.no_tray)
