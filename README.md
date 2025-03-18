# W2W Menu Management System

## Overview
This Node.js application provides comprehensive menu management for restaurants and food service businesses. It handles menu creation, updating, order processing, and integrates with printing systems for order fulfillment. The system uses MongoDB for data persistence and Redis for high-performance caching.

## Features
- Complete menu management (products, categories, extras, allergens)
- Order processing and tracking
- Printer zone configuration for kitchen/bar order routing
- In-memory caching with Redis for performance optimization
- RESTful API for integration with frontends and third-party systems
- File upload support for menu items and configurations
- Authentication and authorization system
- WhatsApp integration for order notifications
- Payment processing via Redsys
- Email notifications via SendGrid

## Prerequisites
- Node.js (v14+) and npm
- MongoDB instance
- Redis server
- Docker and Docker Compose (optional)

## Environment Variables
Create a `.env` file in the root directory with the following variables:

### Core Configuration
```
PORT=3000                            # Application port
MONGO_URI=mongodb://mongo:27017/w2w  # MongoDB connection string
REDIS_URL=redis://redis:6379         # Redis connection string
ENABLE_BULL=true                     # Enable background job processing
```

### WhatsApp Integration
```
VERIFY_TOKEN=your_verify_token       # WhatsApp webhook verification token
WHATSAPP_ACCESS_TOKEN=your_token     # WhatsApp API access token
WHATSAPP_PHONE_ID=your_phone_id      # WhatsApp Business phone ID
```

### AI Integration
```
OPENAI_APIKEY=your_openai_key        # OpenAI API key for AI features
DEEPSEEK_APIKEY=your_deepseek_key    # DeepSeek API key
GOOGLE_GEMINI=your_gemini_key        # Google Gemini API key
```

### Payment Processing (Redsys)
```
REDSYS_MERCHANT_CODE=your_code       # Merchant code provided by Redsys
REDSYS_TERMINAL=1                    # Terminal number
REDSYS_SECRET_KEY=your_secret        # Secret key for transaction signing
REDSYS_URL_REDSYS=redsys_endpoint    # Redsys payment endpoint
REDSYS_URL_NOTIFY=callback_url       # Webhook for payment notifications
REDSYS_URL_OK=success_url            # Redirect URL for successful payments
REDSYS_URL_KO=failure_url            # Redirect URL for failed payments
BASE_URL=your_app_base_url           # Base URL of your application
```

### Email Notifications (SendGrid)
```
SENDGRID_API_KEY=your_sendgrid_key   # SendGrid API key
SENDGRID_FROM_EMAIL=email@domain.com # Sender email address
SENDGRID_SANDBOX_MODE=false          # Enable/disable sandbox mode
```

## Installation

### Using npm
```bash
# Install dependencies
npm install

# Start the application
npm start
```

### Using Docker
```bash
# Build and run with Docker Compose
docker-compose up --build
```

## API Documentation

The API provides endpoints for managing:
- Categories
- Products
- Extras/Addons
- Allergens
- Orders
- Printer configurations

Example API calls:
```
GET /api/categories - List all categories
POST /api/products - Create a new product
PUT /api/products/:id - Update a product
DELETE /api/products/:id - Remove a product
```

## Project Structure
```
src/
  ├── controllers/ - API request handlers
  ├── models/ - Database schemas
  ├── routes/ - API route definitions
  ├── services/ - Business logic
  ├── utils/ - Helper functions
  └── app.js - Main application entry point
public/ - Static files
uploads/ - User uploaded content
medias/ - Media storage
```

## Troubleshooting
- If Redis connection fails, ensure the Redis server is running and the REDIS_URL is correct
- For MongoDB connection issues, verify your MongoDB instance is accessible and the MONGO_URI is valid
- WhatsApp integration requires properly configured webhook endpoints
- For payment processing issues, check Redsys credentials and endpoint configuration

## License - Proprietary and Confidential
This software is proprietary and confidential. Unauthorized copying, transferring, or reproduction of this software, via any medium is strictly prohibited. This software is provided for developmental purposes only to authorized individuals. It may not be copied, modified, distributed, or shared without explicit written permission from the copyright holder.

All source code, designs, algorithms, and business logic contained within this application are trade secrets. Developers granted access to this code are bound by confidentiality agreements and may only use the software for purposes explicitly authorized by the copyright holder.

Any violation of these terms will result in immediate termination of access and may lead to legal action.

© 2025 W2W Project. All Rights Reserved.