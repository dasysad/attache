from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, SecretStr
from datetime import datetime

class EntityType(str, Enum):
    PERSON = "person"
    ORGANIZATION = "organization"
    GOVERNMENT = "government"
    BUSINESS = "business"

class AccountType(str, Enum):
    BANK = "bank"
    INVESTMENT = "investment"
    CREDIT_CARD = "credit_card"
    LOAN = "loan"
    MORTGAGE = "mortgage"
    UTILITY = "utility"
    SUBSCRIPTION = "subscription"
    MEMBERSHIP = "membership"

class AssetType(str, Enum):
    REAL_ESTATE = "real_estate"
    VEHICLE = "vehicle"
    INVESTMENT = "investment"
    OTHER = "other"

class Entity(BaseModel):
    id: str
    name: str
    type: EntityType
    description: Optional[str] = None
    contact_info: Optional[dict] = None
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()

class Account(BaseModel):
    id: str
    entity_id: str
    type: AccountType
    name: str
    account_number: Optional[str] = None
    balance: Optional[float] = None
    currency: str = "USD"
    is_active: bool = True
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()

class Credential(BaseModel):
    id: str
    entity_id: str
    account_id: str
    username: str
    password: SecretStr
    additional_fields: Optional[dict] = None
    last_used: Optional[datetime] = None
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()

class Asset(BaseModel):
    id: str
    entity_id: str
    type: AssetType
    name: str
    value: float
    purchase_date: Optional[datetime] = None
    description: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()

class Debt(BaseModel):
    id: str
    entity_id: str
    account_id: str
    principal: float
    interest_rate: float
    monthly_payment: float
    start_date: datetime
    end_date: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()

class Subscription(BaseModel):
    id: str
    entity_id: str
    name: str
    monthly_cost: float
    billing_cycle: str
    start_date: datetime
    end_date: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now() 