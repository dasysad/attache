from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from datetime import datetime
import asyncio
from aiohttp import ClientSession, ClientTimeout
from ..models import Credential
from ..integrations import FinancialServiceIntegration

class ScrapingTask(ABC):
    def __init__(self, credential: Credential):
        self.credential = credential
        self._session: Optional[ClientSession] = None
        self.timeout = ClientTimeout(total=30)  # 30 second timeout

    async def __aenter__(self):
        self._session = ClientSession(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._session:
            await self._session.close()

    @abstractmethod
    async def execute(self) -> Dict[str, Any]:
        """Execute the scraping task and return the results"""
        pass

class BankScrapingTask(ScrapingTask):
    async def execute(self) -> Dict[str, Any]:
        """Scrape bank account information"""
        integration = FinancialServiceIntegration(self.credential)
        try:
            await integration.connect()
            accounts = await integration.get_accounts()
            transactions = {}
            for account in accounts:
                # Get last 30 days of transactions
                end_date = datetime.now()
                start_date = end_date.replace(day=1)  # Start of current month
                transactions[account.id] = await integration.get_transactions(
                    account.id, start_date, end_date
                )
            return {
                "accounts": [account.dict() for account in accounts],
                "transactions": transactions
            }
        finally:
            await integration.disconnect()

class UtilityScrapingTask(ScrapingTask):
    async def execute(self) -> Dict[str, Any]:
        """Scrape utility bill information"""
        integration = FinancialServiceIntegration(self.credential)
        try:
            await integration.connect()
            accounts = await integration.get_accounts()
            bills = {}
            for account in accounts:
                bills[account.id] = await integration.get_transactions(
                    account.id, 
                    datetime.now().replace(day=1),  # Start of current month
                    datetime.now()
                )
            return {
                "accounts": [account.dict() for account in accounts],
                "bills": bills
            }
        finally:
            await integration.disconnect()

class ScrapingScheduler:
    def __init__(self):
        self.tasks: Dict[str, asyncio.Task] = {}
        self.running = False

    async def schedule_task(self, task_id: str, task: ScrapingTask, interval_seconds: int):
        """Schedule a scraping task to run at regular intervals"""
        if task_id in self.tasks:
            self.tasks[task_id].cancel()
        
        async def run_periodically():
            while self.running:
                try:
                    async with task:
                        results = await task.execute()
                        # TODO: Store results in database
                        print(f"Task {task_id} completed successfully")
                except Exception as e:
                    print(f"Error in task {task_id}: {str(e)}")
                await asyncio.sleep(interval_seconds)

        self.tasks[task_id] = asyncio.create_task(run_periodically())

    def start(self):
        """Start the scheduler"""
        self.running = True

    def stop(self):
        """Stop the scheduler and all running tasks"""
        self.running = False
        for task in self.tasks.values():
            task.cancel()

    async def shutdown(self):
        """Gracefully shutdown the scheduler"""
        self.stop()
        for task in self.tasks.values():
            try:
                await task
            except asyncio.CancelledError:
                pass 