import asyncio
import logging
from typing import Dict, List
from datetime import datetime, timedelta
from .scraper import ScrapingScheduler, BankScrapingTask, UtilityScrapingTask
from .storage import ScrapedDataStorage
from ..models import Credential
from ..secure_storage import SecureStorage

class ScrapingService:
    def __init__(self):
        self.scheduler = ScrapingScheduler()
        self.storage = ScrapedDataStorage()
        self.secure_storage = SecureStorage()
        self.logger = logging.getLogger(__name__)
        self._cleanup_task = None

    async def start(self):
        """Start the scraping service"""
        self.logger.info("Starting scraping service")
        self.scheduler.start()
        
        # Start cleanup task
        self._cleanup_task = asyncio.create_task(self._run_cleanup())
        
        # Load and schedule existing credentials
        await self._schedule_existing_credentials()

    async def stop(self):
        """Stop the scraping service"""
        self.logger.info("Stopping scraping service")
        if self._cleanup_task:
            self._cleanup_task.cancel()
        await self.scheduler.shutdown()

    async def add_credential(self, credential: Credential):
        """Add a new credential and schedule its scraping tasks"""
        # Store the credential securely
        self.secure_storage.store_credential(credential)
        
        # Create and schedule appropriate tasks
        if "bank" in credential.account_id:
            task = BankScrapingTask(credential)
            await self.scheduler.schedule_task(
                f"bank_{credential.id}",
                task,
                interval_seconds=3600  # Run every hour
            )
        elif "utility" in credential.account_id:
            task = UtilityScrapingTask(credential)
            await self.scheduler.schedule_task(
                f"utility_{credential.id}",
                task,
                interval_seconds=86400  # Run every day
            )

    async def _schedule_existing_credentials(self):
        """Load and schedule all existing credentials"""
        credential_ids = self.secure_storage.list_credentials()
        for cred_id in credential_ids:
            credential = self.secure_storage.get_credential(cred_id)
            if credential:
                await self.add_credential(credential)

    async def _run_cleanup(self):
        """Run periodic cleanup of old data"""
        while True:
            try:
                # Run cleanup every day at midnight
                now = datetime.now()
                next_run = (now + timedelta(days=1)).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                await asyncio.sleep((next_run - now).total_seconds())
                
                self.logger.info("Running data cleanup")
                self.storage.cleanup_old_data()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error during cleanup: {str(e)}")
                await asyncio.sleep(3600)  # Wait an hour before retrying

async def run_scraping_service():
    """Run the scraping service as a standalone process"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    service = ScrapingService()
    try:
        await service.start()
        # Keep the service running
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        await service.stop()
    except Exception as e:
        logging.error(f"Error in scraping service: {str(e)}")
        await service.stop()
        raise 