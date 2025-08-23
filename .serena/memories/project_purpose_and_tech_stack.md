# CampXus - Project Purpose and Tech Stack

## Project Purpose
CampXus is a comprehensive Firebase-powered social scheduling platform built specifically for university students. It combines intelligent schedule management with advanced social features, privacy-aware friend systems, and real-time collaboration tools to create a seamless campus networking experience.

## Core Features
- University student discovery and social connections
- Smart schedule management with OCR image recognition 
- Real-time friend requests and notifications
- Privacy-aware schedule sharing with bilateral controls
- Campus presence detection using 3-tier location system
- Modern glassmorphism UI with responsive design

## Tech Stack

### Frontend
- **Vanilla JavaScript (ES6+ Modules)** - Clean, dependency-free codebase
- **Single Page Application (SPA)** with custom router system
- **Modular CSS Architecture** with glassmorphism design
- **Vite** - Build system and development server

### Backend Services  
- **Firebase Authentication** - University email validation
- **Firestore Database** - Real-time data storage
- **Firebase Hosting** - Deployment and serving

### Key Dependencies
- **Firebase v11.8.1** - Authentication, database, real-time listeners
- **Tesseract.js v6.0.1** - OCR processing for schedule images
- **Jest v29.7.0** - Testing framework with ESM support
- **Playwright v1.54.1** - Browser automation and testing

### Architecture Highlights
- Real-time event system with memory-efficient cleanup
- 3-tier location detection system (Network IP → Browser GPS → Google API)
- Dual storage strategy (Firestore + localStorage cache)
- Circuit breaker patterns for performance protection
- Enterprise-grade privacy controls with bilateral friendship permissions