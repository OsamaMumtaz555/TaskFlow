# TaskFlow

A full-stack task and team management web app built as a portfolio project to demonstrate MERN stack skills — user authentication, role-based access control, and full CRUD functionality.

## Features

- User registration and login with JWT-based authentication
- Role-based access control (Admin vs Member)
- Only Admins can delete tasks
- Full task management: create, view, and delete tasks
- Real-time search and status filtering
- Dashboard summary showing task counts by status
- Passwords hashed with bcrypt before storage
- Protected API routes and protected frontend routes

## Tech Stack

**Frontend:**
- React (Vite)
- Tailwind CSS
- React Router
- Axios

**Backend:**
- Node.js
- Express.js
- MongoDB Atlas (Mongoose)
- JWT (jsonwebtoken)
- bcryptjs

## Project Structure

Project TaskFlow/
├── taskflow-frontend/ # React app
│ └── src/
│ ├── api/ # Axios instance + interceptor
│ ├── components/ # Login, Navbar, Sidebar, TaskBoard, ProtectedRoute
│ └── pages/ # LoginPage, DashboardPage
└── taskflow-backend/ # Express API
├── controllers/ # Route logic
├── models/ # Mongoose schemas (User, Task)
├── routes/ # API route definitions
├── middleware/ # JWT auth + role-check middleware
└── utils/ # Token generation helper


## API Endpoints

| Method | Endpoint             | Access         | Description               |
|--------|-----------------------|----------------|----------------------------|
| POST   | /api/auth/register    | Public         | Register a new user        |
| POST   | /api/auth/login       | Public         | Log in, returns JWT        |
| GET    | /api/tasks            | Logged in      | Get all tasks               |
| POST   | /api/tasks            | Logged in      | Create a task                |
| PUT    | /api/tasks/:id        | Logged in      | Update a task                 |
| DELETE | /api/tasks/:id        | Admin only      | Delete a task                  |

## Getting Started

### Prerequisites
- Node.js installed
- A MongoDB Atlas account (or local MongoDB)

### Backend Setup
```bash
cd taskflow-backend
npm install
```
Create a `.env` file in `taskflow-backend/` with:

MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
PORT=5000

Run the server:
```bash
npm run dev
```

### Frontend Setup
```bash
cd taskflow-frontend
npm install
npm run dev
```
The app will be available at `http://localhost:5173`.

## What I Learned

Building TaskFlow gave me hands-on experience with:
- Structuring a MERN backend (routes/controllers/models separation)
- Implementing JWT authentication and role-based authorization from scratch
- Handling CORS between frontend and backend during local development
- Connecting a React frontend to a real REST API with Axios, including automatic token attachment via interceptors
- Managing auth state and protected routes in React Router

## Future Improvements
- Deploy frontend (Vercel) and backend (Render/Railway)
- Add task editing (currently only create/delete)
- Add task assignment between team members