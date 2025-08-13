# AI Multi-Industry SaaS Landing Platform

## Overview
Platform generates SEO-friendly, multi-language landing pages with AI, supports PWA, push notifications, CRM & billing integrations.

## Requirements
- Node.js 20+
- MongoDB 6+
- OpenAI API key
- VAPID keys for push notifications

## Installation
git clone https://github.com/you/ai-landing.git
cd ai-landing
cp .env.example .env
npm install

## Running locally
npm start

  or with Docker:
docker-compose up --build

## Testing routes
Run the route checker:
node test/routes-checker.js

## API Docs
See [`openapi.yaml`](openapi.yaml)
