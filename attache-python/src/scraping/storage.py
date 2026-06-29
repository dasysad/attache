from typing import Dict, Any, List
from datetime import datetime
import json
from pathlib import Path
import logging

class ScrapedDataStorage:
    def __init__(self, storage_path: str = "~/.attache/scraped_data"):
        self.storage_path = Path(storage_path).expanduser()
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger(__name__)

    def _get_data_path(self, entity_id: str, account_id: str) -> Path:
        """Get the path for storing data for a specific account"""
        return self.storage_path / entity_id / f"{account_id}.json"

    def store_scraped_data(self, entity_id: str, account_id: str, data: Dict[str, Any]) -> None:
        """Store scraped data for an account"""
        try:
            data_path = self._get_data_path(entity_id, account_id)
            data_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Add timestamp to the data
            data["scraped_at"] = datetime.now().isoformat()
            
            # Read existing data if any
            existing_data = []
            if data_path.exists():
                with open(data_path, "r") as f:
                    existing_data = json.load(f)
            
            # Append new data
            existing_data.append(data)
            
            # Keep only last 30 days of data
            if len(existing_data) > 30:
                existing_data = existing_data[-30:]
            
            # Write updated data
            with open(data_path, "w") as f:
                json.dump(existing_data, f, indent=2)
            
            self.logger.info(f"Successfully stored data for {entity_id}/{account_id}")
        except Exception as e:
            self.logger.error(f"Error storing data for {entity_id}/{account_id}: {str(e)}")

    def get_scraped_data(self, entity_id: str, account_id: str, days: int = 30) -> List[Dict[str, Any]]:
        """Retrieve scraped data for an account"""
        try:
            data_path = self._get_data_path(entity_id, account_id)
            if not data_path.exists():
                return []
            
            with open(data_path, "r") as f:
                data = json.load(f)
            
            # Filter data for the specified number of days
            cutoff_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            cutoff_date = cutoff_date.replace(day=cutoff_date.day - days)
            
            return [
                entry for entry in data
                if datetime.fromisoformat(entry["scraped_at"]) >= cutoff_date
            ]
        except Exception as e:
            self.logger.error(f"Error retrieving data for {entity_id}/{account_id}: {str(e)}")
            return []

    def cleanup_old_data(self, days_to_keep: int = 30) -> None:
        """Clean up data older than the specified number of days"""
        try:
            cutoff_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            cutoff_date = cutoff_date.replace(day=cutoff_date.day - days_to_keep)
            
            for entity_dir in self.storage_path.iterdir():
                if not entity_dir.is_dir():
                    continue
                
                for data_file in entity_dir.glob("*.json"):
                    with open(data_file, "r") as f:
                        data = json.load(f)
                    
                    # Filter out old data
                    filtered_data = [
                        entry for entry in data
                        if datetime.fromisoformat(entry["scraped_at"]) >= cutoff_date
                    ]
                    
                    # Write back filtered data
                    with open(data_file, "w") as f:
                        json.dump(filtered_data, f, indent=2)
            
            self.logger.info(f"Successfully cleaned up data older than {days_to_keep} days")
        except Exception as e:
            self.logger.error(f"Error cleaning up old data: {str(e)}") 