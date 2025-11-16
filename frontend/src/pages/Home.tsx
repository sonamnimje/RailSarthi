import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [showModal, setShowModal] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const [enableHoverEffects, setEnableHoverEffects] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(pointer: fine) and (min-width: 1024px)');
    const updateHoverState = () => setEnableHoverEffects(mediaQuery.matches);
    updateHoverState();

    if (typeof mediaQuery.addEventListener === 'function') {
      const listener = (event: MediaQueryListEvent) => setEnableHoverEffects(event.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }

    const legacyListener = (event: MediaQueryListEvent) => setEnableHoverEffects(event.matches);
    mediaQuery.addListener(legacyListener);
    return () => mediaQuery.removeListener(legacyListener);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgba(219,234,254,0.92), rgba(191,219,254,0.88)), url('/bg4.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: isMobile ? 'scroll' : 'fixed',
        backgroundRepeat: 'no-repeat',
        backgroundBlendMode: 'overlay',
      }}
    >
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* City Skyline Background */}
        <div className="absolute bottom-0 left-0 w-full h-24 sm:h-32 bg-gradient-to-t from-blue-200 to-transparent hidden md:block">
          <div className="absolute bottom-0 left-0 w-full h-16 sm:h-24 bg-blue-300 opacity-30">
            {/* Simple city skyline shapes with animation */}
            <div className="absolute bottom-0 left-0 w-6 sm:w-8 h-12 sm:h-16 bg-blue-400 transition-all duration-1000 hover:h-16 sm:hover:h-20"></div>
            <div className="absolute bottom-0 left-12 sm:left-12 w-5 sm:w-6 h-16 sm:h-20 bg-blue-400 transition-all duration-1000 hover:h-20 sm:hover:h-24"></div>
            <div className="absolute bottom-0 left-24 sm:left-24 w-8 sm:w-10 h-10 sm:h-12 bg-blue-400 transition-all duration-1000 hover:h-14 sm:hover:h-16"></div>
            <div className="absolute bottom-0 left-40 sm:left-40 w-6 sm:w-7 h-16 sm:h-20 bg-blue-400 transition-all duration-1000 hover:h-20 sm:hover:h-24"></div>
            <div className="absolute bottom-0 left-56 sm:left-56 w-7 sm:w-9 h-12 sm:h-14 bg-blue-400 transition-all duration-1000 hover:h-16 sm:hover:h-20"></div>
            <div className="absolute bottom-0 left-72 sm:left-72 w-5 sm:w-6 h-20 sm:h-24 bg-blue-400 transition-all duration-1000 hover:h-24 sm:hover:h-28"></div>
            <div className="absolute bottom-0 left-84 sm:left-84 w-6 sm:w-8 h-12 sm:h-16 bg-blue-400 transition-all duration-1000 hover:h-16 sm:hover:h-20"></div>
            <div className="absolute bottom-0 left-96 sm:left-96 w-4 sm:w-5 h-16 sm:h-20 bg-blue-400 transition-all duration-1000 hover:h-20 sm:hover:h-24"></div>
            <div className="absolute bottom-0 right-0 w-10 sm:w-12 h-8 sm:h-10 bg-blue-400 transition-all duration-1000 hover:h-12 sm:hover:h-14"></div>
          </div>
        </div>
        
        {/* Animated Train in background */}
        <div 
          className="absolute bottom-6 sm:bottom-8 w-24 sm:w-32 h-6 sm:h-8 bg-gray-300 rounded-lg opacity-40 transition-transform duration-1000 hidden md:block"
          style={{
            left: `${25 + (scrollY * 0.1)}%`,
            transform: `translateX(${Math.sin(scrollY * 0.01) * 20}px)`
          }}
        >
          <div className="absolute top-0.5 sm:top-1 left-1.5 sm:left-2 w-4 sm:w-6 h-4 sm:h-6 bg-gray-400 rounded-full animate-pulse"></div>
          <div className="absolute top-0.5 sm:top-1 right-1.5 sm:right-2 w-4 sm:w-6 h-4 sm:h-6 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
        </div>
      </div>

      {/* Main Hero Section */}
      <div className="relative min-h-screen w-full flex items-center justify-center px-6 sm:px-10">
        {/* Centered Hero Content */}
        <main
          ref={heroRef}
          className="relative z-10 w-full max-w-4xl mx-auto text-center"
          style={{
            transform: `translateY(calc(-40px + ${scrollY * 0.3}px))`,
            opacity: Math.max(0, Math.min(1, 1 - scrollY / 500))
          }}
        >
          {/* HERO TITLE */}
          <h1 
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.15] tracking-tight text-white mb-8 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all duration-300 hover:drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)] cursor-default"
            style={{
              letterSpacing: '0.05em',
              transform: 'scaleX(1.1)',
              transformOrigin: 'center center'
            }}
          >
            <span className="block whitespace-nowrap transition-all duration-300 hover:scale-105 hover:text-blue-100 hover:translate-y-[-2px]">AI-Powered Rail Operations</span>
            <span className="block whitespace-nowrap transition-all duration-300 hover:scale-105 hover:text-teal-100 hover:translate-y-[-2px]">for a Smarter, Safer India</span>
          </h1>

          {/* Centered Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              className="inline-flex items-center justify-center gap-3 rounded-full bg-green-500 px-8 py-3.5 text-lg font-semibold text-white shadow-xl transition-all duration-300 hover:-translate-y-2 hover:bg-green-600 hover:shadow-2xl hover:shadow-green-500/50 hover:scale-105 active:scale-95"
              onClick={() => setShowModal(true)}
            >
              Get Started
            </button>

            <button
              className="inline-flex items-center justify-center gap-3 rounded-full bg-orange-500 px-8 py-3.5 text-lg font-semibold text-white shadow-xl transition-all duration-300 hover:-translate-y-2 hover:bg-orange-600 hover:shadow-2xl hover:shadow-orange-500/50 hover:scale-105 active:scale-95"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            >
              Learn More
            </button>
          </div>
        </main>
      </div>

      {/* Features Section */}
      <section 
        id="features"
        className="relative z-10 px-4 py-12 bg-gradient-to-br from-blue-50 via-blue-50 to-teal-50 backdrop-blur-sm sm:px-6 sm:py-16 md:py-20"
        style={{
          transform: `translateY(${-scrollY * 0.1}px)`,
          opacity: Math.max(0, Math.min(1, (scrollY - 200) / 300))
        }}
      >
        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-blue-200 rounded-full opacity-20 blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-teal-200 rounded-full opacity-20 blur-3xl"></div>
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          {/* Section Header with Badge */}
          <div className="text-center mb-8 sm:mb-12 md:mb-16">
            <div className="inline-block mb-3 sm:mb-4">
              <span className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-blue-600 to-teal-600 text-white text-sm sm:text-base md:text-lg font-bold rounded-full shadow-lg animate-pulse">
                ✨ POWERED BY AI
              </span>
            </div>
            <h2 
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-teal-600 to-blue-800 mb-3 sm:mb-4 transition-all duration-500 hover:scale-105"
              style={{
                transform: `translateY(${Math.sin(scrollY * 0.01) * 5}px)`,
                textShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}
            >
              Core Features
            </h2>
            <div className="w-16 sm:w-20 md:w-24 h-0.5 sm:h-1 bg-gradient-to-r from-blue-600 to-teal-600 mx-auto rounded-full mb-4 sm:mb-6"></div>
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-gray-600 max-w-2xl mx-auto px-4">
              Discover the powerful capabilities that make RailAnukriti the leading solution for intelligent train traffic management
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            <FeatureCard
              index={0}
              title="AI-Powered Optimization"
              description="Advanced algorithms optimize train schedules and routes for maximum efficiency and minimal delays."
              icon={<svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
              enableHoverEffects={enableHoverEffects}
            />
            <FeatureCard
              index={1}
              title="Real-time Simulation"
              description="Test scenarios and disruptions using our digital twin technology for better planning."
              icon={<svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
              enableHoverEffects={enableHoverEffects}
            />
            <FeatureCard
              index={2}
              title="Live Monitoring"
              description="Monitor train status and network health in real-time with intuitive dashboards."
              icon={<svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8M8 13h6M8 17h4" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
              enableHoverEffects={enableHoverEffects}
            />
            <FeatureCard
              index={3}
              title="Human-in-the-Loop"
              description="Controllers can override AI decisions with adaptive learning from past interactions."
              icon={<svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 20v-2a4 4 0 018 0v2" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
              enableHoverEffects={enableHoverEffects}
            />
            <FeatureCard
              index={4}
              title="Comprehensive Reports"
              description="Generate detailed analytics on performance, delays, and resource utilization."
              icon={<svg className="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
              enableHoverEffects={enableHoverEffects}
            />
            <FeatureCard
              index={5}
              title="Adaptive Learning"
              description="System learns from delays and overrides to make smarter decisions over time."
              icon={<svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              hoveredCard={hoveredCard}
              setHoveredCard={setHoveredCard}
              enableHoverEffects={enableHoverEffects}
            />
          </div>
        </div>
      </section>

      {/* Modal Popup */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm animate-fade-in p-4"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-blue-50 rounded-xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm flex flex-col items-center relative transform transition-all duration-300 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-red-600 text-3xl sm:text-4xl transition-all duration-300 hover:rotate-90 hover:scale-125 hover:bg-red-50 rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center"
              onClick={() => setShowModal(false)}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Get Started</h3>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-4 sm:mb-6 text-center">Sign in or create an account to access all features.</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full">
              <button
                className="flex-1 px-6 py-3 sm:py-3 bg-blue-600 text-white rounded-lg text-lg sm:text-lg md:text-xl font-semibold hover:bg-blue-700 transition-all duration-300 hover:scale-110 hover:-translate-y-1 active:scale-95 shadow-md hover:shadow-xl hover:shadow-blue-500/50"
                onClick={() => handleNavigate('/login')}
              >
                Login
              </button>
              <button
                className="flex-1 px-6 py-3 sm:py-3 bg-gray-200 text-blue-700 rounded-lg text-lg sm:text-lg md:text-xl font-semibold hover:bg-blue-100 hover:text-blue-800 transition-all duration-300 hover:scale-110 hover:-translate-y-1 active:scale-95 shadow-md hover:shadow-xl hover:shadow-blue-300/50"
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
  setHoveredCard,
  enableHoverEffects
}: { 
  index: number;
  title: string; 
  description: string; 
  icon: React.ReactNode;
  hoveredCard: number | null;
  setHoveredCard: (index: number | null) => void;
  enableHoverEffects: boolean;
}) {
  const isHovered = hoveredCard === index;
  const isOtherHovered = hoveredCard !== null && hoveredCard !== index;

  const transform = enableHoverEffects
    ? isHovered
      ? 'scale(1.05) translateY(-10px)'
      : isOtherHovered
      ? 'scale(0.97)'
      : 'scale(1)'
    : isHovered
    ? 'scale(1.02)'
    : 'scale(1)';

  const handlePointerEnter = () => {
    if (enableHoverEffects) {
      setHoveredCard(index);
    }
  };

  const handlePointerLeave = () => {
    if (enableHoverEffects) {
      setHoveredCard(null);
    }
  };

  const handleToggle = () => {
    if (!enableHoverEffects) {
      setHoveredCard(isHovered ? null : index);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setHoveredCard(isHovered ? null : index);
    }
  };

  return (
    <div 
      role="button"
      tabIndex={0}
      aria-pressed={isHovered}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      onFocus={enableHoverEffects ? () => setHoveredCard(index) : undefined}
      onBlur={enableHoverEffects ? () => setHoveredCard(null) : undefined}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={`relative flex flex-col items-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl border-2 bg-blue-50 p-4 sm:p-6 md:p-8 text-left transition-all duration-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        isHovered 
          ? 'border-blue-500 shadow-xl ring-2 ring-blue-200'
          : isOtherHovered
          ? 'border-gray-200 opacity-60'
          : 'border-gray-200 hover:border-blue-300 hover:shadow-lg'
      }`}
      style={{
        transform,
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        animationDelay: `${index * 0.1}s`,
      }}
    >
      {/* Decorative corner accent */}
      <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/20 to-transparent rounded-bl-full transition-opacity duration-500 ${
        isHovered ? 'opacity-100' : 'opacity-0'
      }`}></div>
      
      {/* Icon container with enhanced styling */}
      <div 
        className={`mb-2 sm:mb-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-100 to-teal-100 transition-all duration-500 ${
          isHovered && enableHoverEffects ? 'scale-110 rotate-6 shadow-lg' : 'shadow-md'
        }`}
      >
        <div className="w-6 h-6 sm:w-8 sm:h-8">
          {icon}
        </div>
      </div>
      
      <h3 className={`text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-center transition-colors duration-300 ${
        isHovered ? 'text-blue-600' : 'text-gray-900'
      }`}>
        {title}
      </h3>
      <p className={`text-center text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed transition-all duration-500 ${
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
      <div className={`absolute top-2 left-2 sm:top-4 sm:left-4 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-600 to-teal-600 text-white text-xs font-bold flex items-center justify-center transition-all duration-500 ${
        isHovered ? 'scale-125 shadow-lg' : 'scale-100'
      }`}>
        {index + 1}
      </div>
    </div>
  );
}

export default Home;
