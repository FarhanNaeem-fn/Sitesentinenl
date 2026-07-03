import os
import uuid
import datetime
from typing import Dict, Any, List, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

class SupabaseManager:
    def __init__(self):
        self.client: Optional[Client] = None
        if SUPABASE_URL and SUPABASE_KEY and "your-project-url" not in SUPABASE_URL:
            try:
                self.client = create_client(SUPABASE_URL, SUPABASE_KEY)
            except Exception as e:
                print(f"Supabase init error: {e}")

    def is_enabled(self) -> bool:
        return self.client is not None

    def create_scan(self, scan_type: str, url: str) -> str:
        """Create a new scan record and return the UUID."""
        if not self.is_enabled():
            return str(uuid.uuid4())
        
        try:
            # We don't have project_id here yet, so we leave it null for now
            data = {
                "type": scan_type,
                "url": url,
                "status": "running",
                "progress": 0
            }
            res = self.client.table("scans").insert(data).execute()
            if res.data:
                return res.data[0]["id"]
        except Exception as e:
            print(f"Error creating scan in Supabase: {e}")
        
        return str(uuid.uuid4())

    def log(self, scan_id: str, level: str, message: str):
        """Persist a log entry."""
        if not self.is_enabled():
            return
        
        try:
            # Check if scan_id is a valid UUID (our backend might use string IDs for in-memory)
            # If not a UUID, we skip persistence
            uuid.UUID(scan_id)
            self.client.table("scan_logs").insert({
                "scan_id": scan_id,
                "level": level,
                "message": message
            }).execute()
        except Exception:
            pass # Silently fail for logs to avoid breaking the scan

    def update_progress(self, scan_id: str, progress: int):
        """Update scan progress."""
        if not self.is_enabled():
            return
        
        try:
            uuid.UUID(scan_id)
            self.client.table("scans").update({"progress": progress}).eq("id", scan_id).execute()
        except Exception:
            pass

    def complete_scan(self, scan_id: str, result: Dict[str, Any], status: str = "completed"):
        """Mark scan as completed and save results."""
        if not self.is_enabled():
            return
        
        try:
            uuid.UUID(scan_id)
            self.client.table("scans").update({
                "status": status,
                "result": result,
                "progress": 100
            }).eq("id", scan_id).execute()
        except Exception as e:
            print(f"Error completing scan in Supabase: {e}")

    def save_report(self, scan_id: str, file_path: str, report_type: str = None):
        """Upload report from local path to storage and record in DB."""
        if not self.is_enabled():
            return None
        
        try:
            from pathlib import Path
            p = Path(file_path)
            if not p.exists():
                return None
            
            filename = p.name
            content = p.read_bytes()
            if not report_type:
                report_type = p.suffix.lstrip('.')

            uuid.UUID(scan_id)
            # 1. Upload to bucket
            path = f"{scan_id}/{filename}"
            bucket = "reports"
            
            ct = "text/html" if report_type == "html" else "application/json" if report_type == "json" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if report_type == "xlsx" else "application/octet-stream"

            self.client.storage.from_(bucket).upload(path, content, file_options={"content-type": ct})
            
            # 2. Get Public URL
            public_url = self.client.storage.from_(bucket).get_public_url(path)
            
            # 3. Insert into reports table
            self.client.table("reports").insert({
                "scan_id": scan_id,
                "type": report_type,
                "url": public_url,
                "filename": filename,
                "size": len(content)
            }).execute()
            
            return public_url
        except Exception as e:
            print(f"Error saving report to Supabase: {e}")
            return None

    def get_scan_history(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        if not self.is_enabled(): return []
        try:
            res = self.client.table("scans").select("*").order("created_at", descending=True).range(offset, offset + limit - 1).execute()
            return res.data or []
        except: return []

    def get_scan(self, scan_id: str) -> Optional[Dict[str, Any]]:
        if not self.is_enabled(): return None
        try:
            # Try UUID first
            uuid.UUID(scan_id)
            res = self.client.table("scans").select("*").eq("id", scan_id).execute()
            return res.data[0] if res.data else None
        except: return None

    def get_logs(self, scan_id: str) -> List[Dict[str, Any]]:
        if not self.is_enabled(): return []
        try:
            uuid.UUID(scan_id)
            res = self.client.table("scan_logs").select("*").eq("scan_id", scan_id).order("id").execute()
            return res.data or []
        except: return []

    def get_reports(self, scan_id: str) -> List[Dict[str, Any]]:
        if not self.is_enabled(): return []
        try:
            uuid.UUID(scan_id)
            res = self.client.table("reports").select("*").eq("scan_id", scan_id).execute()
            return res.data or []
        except: return []

# Singleton instance
db = SupabaseManager()
