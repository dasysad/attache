# Attache - Personal Financial Assistant

Attache is a comprehensive personal financial assistant that helps you track and manage all aspects of your financial life.

## Features

- Track organizations and entities in your financial life
- Manage bank accounts, investments, and credit cards
- Track assets like real estate and vehicles
- Monitor debts including mortgages and loans
- Manage utility bills and other recurring expenses
- Track subscriptions and memberships
- Secure credential storage for automated data collection
- Integration with various financial services

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/attache.git
cd attache
```

2. Create a virtual environment and activate it:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Security

Attache uses strong encryption to store your credentials securely. All sensitive data is encrypted using Fernet (symmetric encryption) before being stored on disk.

## Data Models

The application uses several core data models:

- `Entity`: Represents organizations and individuals
- `Account`: Represents financial accounts
- `Credential`: Securely stores login information
- `Asset`: Tracks valuable possessions
- `Debt`: Manages loans and other debts
- `Subscription`: Tracks recurring payments

## Integration

Attache provides a framework for integrating with various financial services. The integration system is designed to be extensible, allowing for easy addition of new service providers.

## Development

To run tests:
```bash
pytest
```

## License

MIT License 