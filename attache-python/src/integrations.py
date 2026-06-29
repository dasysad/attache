from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime
from .models import Account, Credential, Entity

class FinancialServiceIntegration(ABC):
    def __init__(self, credential: Credential):
        self.credential = credential
        self._session = None

    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection to the service"""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Close connection to the service"""
        pass

    @abstractmethod
    async def get_accounts(self) -> List[Account]:
        """Retrieve all accounts from the service"""
        pass

    @abstractmethod
    async def get_transactions(self, account_id: str, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Retrieve transactions for a specific account"""
        pass

    @abstractmethod
    async def get_balance(self, account_id: str) -> float:
        """Get current balance for an account"""
        pass

class BankIntegration(FinancialServiceIntegration):
    """Base class for bank integrations"""
    pass

class InvestmentIntegration(FinancialServiceIntegration):
    """Base class for investment account integrations"""
    pass

class UtilityIntegration(FinancialServiceIntegration):
    """Base class for utility company integrations"""
    pass

class SubscriptionIntegration(FinancialServiceIntegration):
    """Base class for subscription service integrations"""
    pass

class IntegrationFactory:
    @staticmethod
    def create_integration(credential: Credential) -> Optional[FinancialServiceIntegration]:
        """Factory method to create appropriate integration based on account type"""
        account_type = credential.account_id.split("_")[0]  # Assuming account_id format: "type_id"
        
        integration_map = {
            "bank": BankIntegration,
            "investment": InvestmentIntegration,
            "utility": UtilityIntegration,
            "subscription": SubscriptionIntegration
        }
        
        integration_class = integration_map.get(account_type)
        if integration_class:
            return integration_class(credential)
        return None 