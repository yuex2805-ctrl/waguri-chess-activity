import { HashRouter, Routes, Route, Link } from "react-router-dom";
import ActivityPage from "./ActivityPage";
import "./style.css";

function Home() {
  return (
    <main className="home-page">
      <section className="home-card">
        <p className="eyebrow">Waguri Chess Lab</p>
        <h1>Waguri Chess Activity</h1>

        <p>
          Play chess, import PGN/FEN, export board images, and use it inside
          Discord Activity.
        </p>

        <div className="home-actions">
          <Link to="/activity" className="primary-btn">
            Open Chess Board
          </Link>

          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noreferrer"
            className="secondary-btn"
          >
            Developer Portal
          </a>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activity" element={<ActivityPage />} />
      </Routes>
    </HashRouter>
  );
}