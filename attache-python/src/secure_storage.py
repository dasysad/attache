from cryptography.fernet import Fernet
from typing import Optional
import os
import json
from pathlib import Path
from .models import Credential

class SecureStorage:
    def __init__(self, storage_path: str = "~/.attache/secure"):
        self.storage_path = Path(storage_path).expanduser()
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.key_path = self.storage_path / "key.key"
        self._load_or_generate_key()

    def _load_or_generate_key(self):
        if self.key_path.exists():
            with open(self.key_path, "rb") as key_file:
                self.key = key_file.read()
        else:
            self.key = Fernet.generate_key()
            with open(self.key_path, "wb") as key_file:
                key_file.write(self.key)
        self.fernet = Fernet(self.key)

    def _get_credential_path(self, credential_id: str) -> Path:
        return self.storage_path / f"credential_{credential_id}.enc"

    def store_credential(self, credential: Credential) -> None:
        """Store a credential securely"""
        credential_path = self._get_credential_path(credential.id)
        credential_dict = credential.dict()
        # Convert SecretStr to string for storage
        credential_dict["password"] = credential_dict["password"].get_secret_value()
        encrypted_data = self.fernet.encrypt(json.dumps(credential_dict).encode())
        with open(credential_path, "wb") as f:
            f.write(encrypted_data)

    def get_credential(self, credential_id: str) -> Optional[Credential]:
        """Retrieve a credential"""
        credential_path = self._get_credential_path(credential_id)
        if not credential_path.exists():
            return None
        
        with open(credential_path, "rb") as f:
            encrypted_data = f.read()
        
        decrypted_data = self.fernet.decrypt(encrypted_data)
        credential_dict = json.loads(decrypted_data.decode())
        return Credential(**credential_dict)

    def delete_credential(self, credential_id: str) -> None:
        """Delete a stored credential"""
        credential_path = self._get_credential_path(credential_id)
        if credential_path.exists():
            credential_path.unlink()

    def list_credentials(self) -> list[str]:
        """List all stored credential IDs"""
        return [
            f.stem.split("_")[1] 
            for f in self.storage_path.glob("credential_*.enc")
        ] 