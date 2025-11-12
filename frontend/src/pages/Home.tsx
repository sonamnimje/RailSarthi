import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [showModal, setShowModal] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    setShowModal(false);
    navigate(path);
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* City Skyline Background */}
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-blue-200 to-transparent">
          <div className="absolute bottom-0 left-0 w-full h-24 bg-blue-300 opacity-30">
            {/* Simple city skyline shapes with animation */}
            <div className="absolute bottom-0 left-0 w-8 h-16 bg-blue-400 transition-all duration-1000 hover:h-20"></div>
            <div className="absolute bottom-0 left-12 w-6 h-20 bg-blue-400 transition-all duration-1000 hover:h-24"></div>
            <div className="absolute bottom-0 left-24 w-10 h-12 bg-blue-400 transition-all duration-1000 hover:h-16"></div>
            <div className="absolute bottom-0 left-40 w-7 h-20 bg-blue-400 transition-all duration-1000 hover:h-24"></div>
            <div className="absolute bottom-0 left-56 w-9 h-14 bg-blue-400 transition-all duration-1000 hover:h-20"></div>
            <div className="absolute bottom-0 left-72 w-6 h-24 bg-blue-400 transition-all duration-1000 hover:h-28"></div>
            <div className="absolute bottom-0 left-84 w-8 h-16 bg-blue-400 transition-all duration-1000 hover:h-20"></div>
            <div className="absolute bottom-0 left-96 w-5 h-20 bg-blue-400 transition-all duration-1000 hover:h-24"></div>
            <div className="absolute bottom-0 right-0 w-12 h-10 bg-blue-400 transition-all duration-1000 hover:h-14"></div>
          </div>
        </div>
        
        {/* Animated Train in background */}
        <div 
          className="absolute bottom-8 w-32 h-8 bg-gray-300 rounded-lg opacity-40 transition-transform duration-1000"
          style={{
            left: `${25 + (scrollY * 0.1)}%`,
            transform: `translateX(${Math.sin(scrollY * 0.01) * 20}px)`
          }}
        >
          <div className="absolute top-1 left-2 w-6 h-6 bg-gray-400 rounded-full animate-pulse"></div>
          <div className="absolute top-1 right-2 w-6 h-6 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
        </div>
        
        {/* Animated Clouds */}
        <div 
          className="absolute top-20 w-16 h-8 bg-white rounded-full opacity-60 transition-all duration-3000"
          style={{
            right: `${20 + (scrollY * 0.05)}%`,
            transform: `translateX(${Math.sin(scrollY * 0.005) * 30}px)`
          }}
        ></div>
        <div 
          className="absolute top-32 w-12 h-6 bg-white rounded-full opacity-60 transition-all duration-3000"
          style={{
            left: `${20 + (scrollY * 0.03)}%`,
            transform: `translateX(${Math.cos(scrollY * 0.005) * 25}px)`
          }}
        ></div>
        <div 
          className="absolute top-16 w-20 h-10 bg-white rounded-full opacity-60 transition-all duration-3000"
          style={{
            left: `${50 + (scrollY * 0.04)}%`,
            transform: `translateX(${Math.sin(scrollY * 0.007) * 35}px)`
          }}
        ></div>
      </div>

      {/* Main Hero Section */}
      <main 
        ref={heroRef}
        className="relative z-10 flex items-center justify-between px-6 py-12 max-w-7xl mx-auto"
        style={{
          transform: `translateY(${scrollY * 0.3}px)`,
          opacity: Math.max(0, Math.min(1, 1 - (scrollY / 500)))
        }}
      >
        {/* Left Side - Text Content */}
        <div className="flex-1 max-w-2xl animate-fade-in">
          <h1 
            className="text-6xl font-bold text-teal-700 mb-2 transition-all duration-500 hover:text-teal-800 hover:scale-105 cursor-default"
            style={{
              textShadow: '2px 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            RailAnukriti
          </h1>
          <p className="text-2xl text-teal-500 mb-6 animate-slide-in-left">AI-Powered Smart Train Traffic Optimizer</p>
          <p className="text-gray-600 text-lg mb-8 leading-relaxed animate-slide-in-left-delay">
            Maximize section throughput using AI-powered precise train traffic control. 
            Our intelligent system optimizes train precedence, crossings, and platform allocation 
            to minimize delays and improve efficiency across Indian Railways.
          </p>
          <button
            className="px-8 py-4 bg-orange-500 text-white font-bold text-lg rounded-lg hover:bg-orange-600 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transform"
            onClick={() => setShowModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) translateY(0)';
            }}
          >
            GET STARTED
          </button>
        </div>

        {/* Right Side - Train Image */}
        <div className="flex-1 flex justify-center items-center">
          <div 
            className="relative w-full max-w-2xl transition-transform duration-500 hover:scale-105"
            style={{
              transform: `translateY(${-scrollY * 0.2}px) rotateY(${Math.sin(scrollY * 0.01) * 2}deg)`
            }}
          >
            <img 
              src="/train-station.jpg" 
              alt="Modern metro train approaching station platform" 
              className="w-full h-auto rounded-2xl shadow-2xl object-cover transition-all duration-500 hover:shadow-3xl"
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.1) contrast(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'brightness(1) contrast(1)';
              }}
            />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-blue-500/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section 
        className="relative z-10 px-6 py-20 bg-gradient-to-br from-blue-50 via-white to-teal-50 backdrop-blur-sm"
        style={{
          transform: `translateY(${-scrollY * 0.1}px)`,
          opacity: Math.max(0, Math.min(1, (scrollY - 200) / 300))
        }}
      >
        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200 rounded-full opacity-20 blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-200 rounded-full opacity-20 blur-3xl"></div>
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          {/* Section Header with Badge */}
          <div className="text-center mb-16">
            <div className="inline-block mb-4">
              <span className="px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-600 text-white text-sm font-bold rounded-full shadow-lg animate-pulse">
                ✨ POWERED BY AI
              </span>
            </div>
            <h2 
              className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-teal-600 to-blue-800 mb-4 transition-all duration-500 hover:scale-105"
              style={{
                transform: `translateY(${Math.sin(scrollY * 0.01) * 5}px)`,
                textShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}
            >
              Core Features
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-blue-600 to-teal-600 mx-auto rounded-full mb-6"></div>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Discover the powerful capabilities that make RailAnukriti the leading solution for intelligent train traffic management
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              index={0}
              title="AI-Powered Optimization"
              description="Advanced algorithms optimize train schedules and routes for maximum efficiency and minimal delays."
              icon={<svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
            />
            <FeatureCard
              index={1}
              title="Real-time Simulation"
              description="Test scenarios and disruptions using our digital twin technology for better planning."
              icon={<svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
            />
            <FeatureCard
              index={2}
              title="Live Monitoring"
              description="Monitor train status and network health in real-time with intuitive dashboards."
              icon={<svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8M8 13h6M8 17h4" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
            />
            <FeatureCard
              index={3}
              title="Human-in-the-Loop"
              description="Controllers can override AI decisions with adaptive learning from past interactions."
              icon={<svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 20v-2a4 4 0 018 0v2" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
            />
            <FeatureCard
              index={4}
              title="Comprehensive Reports"
              description="Generate detailed analytics on performance, delays, and resource utilization."
              icon={<svg className="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
            />
            <FeatureCard
              index={5}
              title="Adaptive Learning"
              description="System learns from delays and overrides to make smarter decisions over time."
              icon={<svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
            />
          </div>
        </div>
      </section>

      {/* Modal Popup */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm flex flex-col items-center relative transform transition-all duration-300 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl transition-transform duration-200 hover:rotate-90 hover:scale-110"
              onClick={() => setShowModal(false)}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Get Started</h3>
            <p className="text-gray-600 mb-6 text-center">Sign in or create an account to access all features.</p>
            <div className="flex gap-4 w-full">
              <button
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all duration-300 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
                onClick={() => handleNavigate('/login')}
              >
                Login
              </button>
              <button
                className="flex-1 px-4 py-2 bg-gray-200 text-blue-700 rounded-lg font-semibold hover:bg-blue-100 transition-all duration-300 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
                onClick={() => handleNavigate('/signup')}
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// FeatureCard component
function FeatureCard({ 
  index, 
  title, 
  description, 
  icon, 
  hoveredCard, 
  setHoveredCard 
}: { 
  index: number;
  title: string; 
  description: string; 
  icon: React.ReactNode;
  hoveredCard: number | null;
  setHoveredCard: (index: number | null) => void;
}) {
  const isHovered = hoveredCard === index;
  const isOtherHovered = hoveredCard !== null && hoveredCard !== index;

  return (
    <div 
      className={`relative flex flex-col items-center bg-white rounded-2xl p-8 border-2 transition-all duration-500 cursor-pointer overflow-hidden ${
        isHovered 
          ? 'border-blue-500 shadow-2xl scale-110 bg-gradient-to-br from-blue-50 via-white to-teal-50 ring-4 ring-blue-200' 
          : isOtherHovered
          ? 'border-gray-200 opacity-50 scale-95'
          : 'border-gray-200 hover:border-blue-300 hover:shadow-xl hover:bg-gradient-to-br hover:from-blue-50/50 hover:to-white'
      }`}
      onMouseEnter={() => setHoveredCard(index)}
      onMouseLeave={() => setHoveredCard(null)}
      style={{
        transform: isHovered 
          ? 'scale(1.1) translateY(-10px) rotateY(5deg)' 
          : isOtherHovered
          ? 'scale(0.95)'
          : 'scale(1)',
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        animationDelay: `${index * 0.1}s`
      }}
    >
      {/* Decorative corner accent */}
      <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/20 to-transparent rounded-bl-full transition-opacity duration-500 ${
        isHovered ? 'opacity-100' : 'opacity-0'
      }`}></div>
      
      {/* Icon container with enhanced styling */}
      <div 
        className={`mb-4 p-4 rounded-2xl bg-gradient-to-br from-blue-100 to-teal-100 transition-all duration-500 ${
          isHovered ? 'scale-125 rotate-12 shadow-lg' : 'shadow-md'
        }`}
      >
        {icon}
      </div>
      
      <h3 className={`text-xl font-bold mb-3 text-center transition-colors duration-300 ${
        isHovered ? 'text-blue-600' : 'text-gray-900'
      }`}>
        {title}
      </h3>
      <p className={`text-center text-sm leading-relaxed transition-all duration-500 ${
        isHovered ? 'text-gray-700' : 'text-gray-600'
      }`}>
        {description}
      </p>
      
      {/* Hover overlay effect */}
      {isHovered && (
        <>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-400/10 via-teal-400/10 to-transparent pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-teal-600"></div>
        </>
      )}
      
      {/* Number badge */}
      <div className={`absolute top-4 left-4 w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-teal-600 text-white text-xs font-bold flex items-center justify-center transition-all duration-500 ${
        isHovered ? 'scale-125 shadow-lg' : 'scale-100'
      }`}>
        {index + 1}
      </div>
    </div>
  );
}

export default Home;
