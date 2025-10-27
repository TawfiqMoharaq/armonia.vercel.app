import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Services from "./pages/Services";
import Diagnosis from "./pages/Diagnosis";
import FamilyGuide from "./pages/FamilyGuide";
import MotionCorrection from "./pages/MotionCorrection";
import ExerciseSetup from "./pages/ExerciseSetup";

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        
        <Route path="/login" element={<Login />} />

        <Route path="/services" element={<Services />} />

        {/* Diagnosis route */}
        <Route path="/diagnosis" element={<Diagnosis />} />

        <Route path="/exercise-setup" element={<ExerciseSetup />} />

        <Route path="/family-guide" element={<FamilyGuide />} />

        <Route path="/motion-correction" element={<MotionCorrection />} />
      </Routes>
    </Router>
  );
};

export default App;
