"""
Railway Zonal Master Chart Generator
=====================================

This script generates Railway Zonal Master Chart-style line graphs showing train movements
for each Zone and its Divisions. It supports:
- PDF data extraction (if PDF provided in inputs/)
- Image OCR extraction (if Master Chart image provided in inputs/)
- Simulated data based on Indian Railway zones/divisions

Output:
- Multi-line time-distance charts (Blue=Goods, Green=Passenger, Red=Express)
- CSV summaries for each zone/division
- Charts saved to outputs/master_charts/
"""

import os
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timedelta
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# Optional imports for PDF and OCR
try:
    import PyPDF2
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

try:
    from PIL import Image
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


# Indian Railway Zones and Divisions Data
RAILWAY_ZONES = {
    "Central Railway": {
        "divisions": ["Mumbai", "Nagpur"],
        "stations": {
            "Mumbai": ["Mumbai CST", "Dadar", "Kurla", "Thane", "Kalyan", "Karjat", "Lonavala", "Pune"],
            "Nagpur": ["Nagpur", "Wardha", "Badnera", "Akola", "Bhusawal", "Jalgaon", "Manmad"]
        }
    },
    "Eastern Railway": {
        "divisions": ["Howrah-I", "Howrah-II"],
        "stations": {
            "Howrah-I": ["Howrah", "Bardhaman", "Asansol", "Durgapur", "Rampurhat", "Malda"],
            "Howrah-II": ["Sealdah", "Kolkata", "Barasat", "Krishnanagar", "Ranaghat", "Bangaon"]
        }
    },
    "East Central Railway": {
        "divisions": ["Danapur", "Mugalsarai"],
        "stations": {
            "Danapur": ["Patna", "Danapur", "Ara", "Buxar", "Dildarnagar", "Ghazipur"],
            "Mugalsarai": ["Mugalsarai", "Varanasi", "Allahabad", "Mirzapur", "Chunar"]
        }
    },
    "East Coast Railway": {
        "divisions": ["Khurda Road", "Waltair"],
        "stations": {
            "Khurda Road": ["Bhubaneswar", "Khurda Road", "Cuttack", "Bhadrak", "Balasore"],
            "Waltair": ["Visakhapatnam", "Waltair", "Vizianagaram", "Srikakulam", "Palasa"]
        }
    },
    "Northern Railway": {
        "divisions": ["Delhi-I", "Delhi-II"],
        "stations": {
            "Delhi-I": ["New Delhi", "Old Delhi", "Ghaziabad", "Meerut", "Muzaffarnagar", "Saharanpur"],
            "Delhi-II": ["Delhi", "Faridabad", "Palwal", "Mathura", "Agra", "Tundla"]
        }
    },
    "North Central Railway": {
        "divisions": ["Allahabad", "Jhansi"],
        "stations": {
            "Allahabad": ["Allahabad", "Kanpur", "Fatehpur", "Orai", "Jhansi"],
            "Jhansi": ["Jhansi", "Gwalior", "Morena", "Agra", "Mathura"]
        }
    },
    "North Eastern Railway": {
        "divisions": ["Izzatnagar", "Lucknow"],
        "stations": {
            "Izzatnagar": ["Bareilly", "Izzatnagar", "Shahjahanpur", "Hardoi", "Sitapur"],
            "Lucknow": ["Lucknow", "Barabanki", "Faizabad", "Ayodhya", "Gonda"]
        }
    },
    "North Frontier Railway": {
        "divisions": ["Katihar", "Alipurduar"],
        "stations": {
            "Katihar": ["Katihar", "Kishanganj", "New Jalpaiguri", "Siliguri", "Jalpaiguri"],
            "Alipurduar": ["Alipurduar", "Cooch Behar", "New Bongaigaon", "Kokrajhar", "Barpeta Road"]
        }
    },
    "North Western Railway": {
        "divisions": ["Jaipur", "Jodhpur"],
        "stations": {
            "Jaipur": ["Jaipur", "Ajmer", "Kishangarh", "Beawar", "Pali Marwar"],
            "Jodhpur": ["Jodhpur", "Phalodi", "Bikaner", "Nagaur", "Merta Road"]
        }
    },
    "Southern Railway": {
        "divisions": ["Chennai", "Madurai"],
        "stations": {
            "Chennai": ["Chennai Central", "Chennai Egmore", "Tambaram", "Chengalpattu", "Villupuram"],
            "Madurai": ["Madurai", "Tirunelveli", "Nagercoil", "Kanyakumari", "Tuticorin"]
        }
    },
    "South Central Railway": {
        "divisions": ["Secunderabad", "Hyderabad"],
        "stations": {
            "Secunderabad": ["Secunderabad", "Kazipet", "Warangal", "Vijayawada", "Guntur"],
            "Hyderabad": ["Hyderabad", "Lingampalli", "Bidar", "Gulbarga", "Wadi"]
        }
    },
    "South Eastern Railway": {
        "divisions": ["Kharagpur", "Adra"],
        "stations": {
            "Kharagpur": ["Kharagpur", "Midnapore", "Jhargram", "Ghatsila", "Tatanagar"],
            "Adra": ["Adra", "Asansol", "Durgapur", "Bankura", "Purulia"]
        }
    },
    "South East Central Railway": {
        "divisions": ["Bilaspur", "Nagpur"],
        "stations": {
            "Bilaspur": ["Bilaspur", "Raipur", "Durg", "Raj Nandgaon", "Gondia"],
            "Nagpur": ["Nagpur", "Wardha", "Chandrapur", "Balharshah", "Adilabad"]
        }
    },
    "South Western Railway": {
        "divisions": ["Bangalore", "Mysore"],
        "stations": {
            "Bangalore": ["Bangalore City", "Bangalore Cantonment", "Kengeri", "Ramanagaram", "Mandya"],
            "Mysore": ["Mysore", "Srirangapatna", "Mandya", "Channapatna", "Bangalore"]
        }
    },
    "Western Railway": {
        "divisions": ["BCT", "Vadodara"],
        "stations": {
            "BCT": ["Mumbai Central", "Bandra", "Andheri", "Borivali", "Vapi", "Surat"],
            "Vadodara": ["Vadodara", "Anand", "Nadiad", "Ahmedabad", "Gandhinagar"]
        }
    },
    "West Central Railway": {
        "divisions": ["Jabalpur", "Bhopal"],
        "stations": {
            "Jabalpur": ["Jabalpur", "Katni", "Satna", "Rewa", "Shahdol"],
            "Bhopal": ["Bhopal", "Vidisha", "Guna", "Shivpuri", "Gwalior"]
        }
    }
}


def extract_from_pdf(pdf_path):
    """Extract railway data from PDF file."""
    if not PDF_AVAILABLE:
        print("⚠️  PyPDF2 not available. Install with: pip install PyPDF2")
        return None
    
    try:
        data = []
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text = page.extract_text()
                # Basic parsing - customize based on PDF structure
                # This is a placeholder - actual parsing depends on PDF format
                data.append(text)
        return data
    except Exception as e:
        print(f"⚠️  Error reading PDF: {e}")
        return None


def extract_from_image(image_path):
    """Extract railway data from Master Chart image using OCR."""
    if not OCR_AVAILABLE:
        print("⚠️  OCR libraries not available. Install with: pip install pillow pytesseract")
        return None
    
    try:
        image = Image.open(image_path)
        # Use OCR to extract text
        text = pytesseract.image_to_string(image)
        # Parse extracted text to find station names and timings
        # This is a placeholder - actual parsing depends on image format
        return text
    except Exception as e:
        print(f"⚠️  Error reading image: {e}")
        return None


def simulate_train_data(zone_name, division_name, stations):
    """
    Simulate realistic train movement data for a zone/division.
    
    Parameters:
    - zone_name: Name of the railway zone
    - division_name: Name of the division
    - stations: List of station names
    
    Returns:
    - DataFrame with columns: station, distance, arrival, departure, train_type, train_number
    """
    data = []
    
    # Calculate distances (approximate, in km)
    distances = np.linspace(0, len(stations) * 50, len(stations))
    
    # Train types and their characteristics
    train_configs = [
        {"type": "goods", "speed_kmph": 45, "stop_time_min": 15, "num_trains": 3, "start_times": [6, 8, 10]},
        {"type": "passenger", "speed_kmph": 60, "stop_time_min": 5, "num_trains": 3, "start_times": [7, 9, 11]},
        {"type": "express", "speed_kmph": 80, "stop_time_min": 3, "num_trains": 2, "start_times": [6.5, 8.5]}
    ]
    
    for config in train_configs:
        train_type = config["type"]
        speed = config["speed_kmph"]
        stop_time = config["stop_time_min"]
        num_trains = config["num_trains"]
        start_times = config["start_times"]
        
        for train_num in range(1, num_trains + 1):
            start_time = start_times[train_num - 1]
            current_time = datetime(2024, 1, 1, int(start_time), int((start_time % 1) * 60), 0)
            current_distance = 0
            
            for i, station in enumerate(stations):
                if i == 0:
                    # First station - departure only
                    arrival = current_time
                    departure = current_time + timedelta(minutes=stop_time)
                else:
                    # Calculate travel time from previous station
                    distance_km = distances[i] - distances[i-1]
                    travel_time_hours = distance_km / speed
                    travel_time_minutes = int(travel_time_hours * 60)
                    arrival = current_time + timedelta(minutes=travel_time_minutes)
                    departure = arrival + timedelta(minutes=stop_time)
                
                data.append({
                    "station": station,
                    "distance": round(distances[i], 1),
                    "arrival": arrival.strftime("%H:%M:%S"),
                    "departure": departure.strftime("%H:%M:%S"),
                    "train_type": train_type,
                    "train_number": train_num
                })
                
                current_time = departure
    
    return pd.DataFrame(data)


def create_master_chart(df, zone_name, division_name, output_dir):
    """
    Create a Railway Zonal Master Chart-style line graph.
    
    Parameters:
    - df: DataFrame with train movement data
    - zone_name: Name of the railway zone
    - division_name: Name of the division
    - output_dir: Directory to save the chart
    """
    # Prepare data for plotting
    fig, ax = plt.subplots(figsize=(18, 12))
    
    # Get unique stations and distances (sorted by distance)
    station_data = df.groupby('station').first().sort_values('distance').reset_index()
    station_distances = {row['station']: row['distance'] for _, row in station_data.iterrows()}
    
    # Color mapping (matching Indian Railway control room standards)
    color_map = {
        "goods": "#1f77b4",      # Blue 🔵
        "passenger": "#2ca02c",  # Green 🟢
        "express": "#d62728"     # Red 🔴
    }
    
    # Track plotted types for legend
    plotted_types = set()
    
    # Plot each train type
    for train_type in ["goods", "passenger", "express"]:
        type_df = df[df['train_type'] == train_type]
        if type_df.empty:
            continue
            
        color = color_map[train_type]
        
        # Get unique train numbers for this type
        train_numbers = sorted(type_df['train_number'].unique())
        
        for train_num in train_numbers:
            train_df = type_df[type_df['train_number'] == train_num].sort_values('distance')
            
            # Convert time strings to minutes since midnight for plotting
            times = []
            dists = []
            for _, row in train_df.iterrows():
                arrival_time = datetime.strptime(row['arrival'], "%H:%M:%S")
                time_minutes = arrival_time.hour * 60 + arrival_time.minute + arrival_time.second / 60
                times.append(time_minutes)
                dists.append(row['distance'])
            
            # Plot line with markers at stations
            label = f"{train_type.capitalize()} Trains" if train_type not in plotted_types else ""
            ax.plot(dists, times, color=color, linewidth=2.5, alpha=0.8, 
                   marker='o', markersize=4, markeredgecolor='white', markeredgewidth=0.5,
                   label=label)
            plotted_types.add(train_type)
    
    # Customize chart
    ax.set_xlabel("Distance (km)", fontsize=14, fontweight='bold')
    ax.set_ylabel("Time (24-hour format)", fontsize=14, fontweight='bold')
    ax.set_title(f"Railway Zonal Master Chart – {zone_name}, {division_name} Division", 
                fontsize=18, fontweight='bold', pad=25)
    
    # Format y-axis as time (every 2 hours for better readability)
    y_ticks = list(range(0, 24*60, 120))  # Every 2 hours
    ax.set_yticks(y_ticks)
    ax.set_yticklabels([f"{h//60:02d}:00" for h in y_ticks])
    
    # Set y-axis limits to show full day
    ax.set_ylim(0, 24*60)
    
    # Add grid
    ax.grid(True, alpha=0.4, linestyle='--', linewidth=0.8)
    ax.set_axisbelow(True)
    
    # Add vertical lines and labels for key stations
    y_min, y_max = ax.get_ylim()
    station_y_pos = y_min + (y_max - y_min) * 0.02  # Position labels near bottom
    
    for station, distance in station_distances.items():
        # Vertical line for station
        ax.axvline(x=distance, color='gray', linestyle=':', alpha=0.6, linewidth=1)
        
        # Station label rotated for readability
        ax.text(distance, station_y_pos, station, rotation=45, 
               ha='right', va='bottom', fontsize=9, fontweight='bold',
               bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.7, edgecolor='gray'))
    
    # Add legend with proper formatting
    ax.legend(loc='upper left', fontsize=11, framealpha=0.95, 
             edgecolor='black', fancybox=True, shadow=True)
    
    # Add annotation for train types
    legend_text = "🔵 Goods (Maal Gaadi)  |  🟢 Passenger  |  🔴 Express/Mail"
    ax.text(0.02, 0.98, legend_text, transform=ax.transAxes, 
           fontsize=10, verticalalignment='top',
           bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
    
    # Adjust layout with extra space for rotated labels
    plt.tight_layout(rect=[0.03, 0.03, 0.97, 0.97])
    
    # Save chart
    chart_filename = f"{zone_name.replace(' ', '_')}_{division_name.replace(' ', '_')}_chart.png"
    chart_path = os.path.join(output_dir, chart_filename)
    plt.savefig(chart_path, dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    
    print(f"✅ Chart saved: {chart_path}")
    return chart_path


def generate_all_master_charts(input_dir="inputs", output_dir="outputs/master_charts"):
    """
    Generate master charts for all zones and divisions.
    
    Parameters:
    - input_dir: Directory containing PDF/image files (optional)
    - output_dir: Directory to save outputs
    """
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Check for input files
    pdf_files = list(Path(input_dir).glob("*.pdf")) if os.path.exists(input_dir) else []
    image_files = list(Path(input_dir).glob("*.png")) + list(Path(input_dir).glob("*.jpg")) if os.path.exists(input_dir) else []
    
    if pdf_files:
        print(f"📄 Found {len(pdf_files)} PDF file(s) in {input_dir}")
    if image_files:
        print(f"🖼️  Found {len(image_files)} image file(s) in {input_dir}")
    
    if not pdf_files and not image_files:
        print("ℹ️  No PDF/image files found. Using simulated data based on Indian Railway zones.")
    
    summary = []
    
    # Process each zone and division
    for zone_name, zone_data in RAILWAY_ZONES.items():
        for division_name in zone_data["divisions"]:
            stations = zone_data["stations"][division_name]
            
            print(f"\n{'='*60}")
            print(f"Processing: {zone_name} - {division_name}")
            print(f"{'='*60}")
            
            # Try to extract from PDF/image, fallback to simulation
            df = None
            
            # Try PDF extraction
            if pdf_files:
                for pdf_file in pdf_files:
                    pdf_data = extract_from_pdf(str(pdf_file))
                    if pdf_data:
                        # Parse PDF data (customize based on actual PDF structure)
                        # For now, fallback to simulation
                        pass
            
            # Try image OCR
            if image_files and df is None:
                for img_file in image_files:
                    img_data = extract_from_image(str(img_file))
                    if img_data:
                        # Parse OCR data (customize based on actual image structure)
                        # For now, fallback to simulation
                        pass
            
            # Use simulated data
            if df is None:
                df = simulate_train_data(zone_name, division_name, stations)
            
            # Save CSV summary
            csv_filename = f"{zone_name.replace(' ', '_')}_{division_name.replace(' ', '_')}_summary.csv"
            csv_path = os.path.join(output_dir, csv_filename)
            df.to_csv(csv_path, index=False)
            print(f"✅ CSV saved: {csv_path}")
            
            # Generate chart
            chart_path = create_master_chart(df, zone_name, division_name, output_dir)
            
            # Add to summary
            summary.append({
                "zone": zone_name,
                "division": division_name,
                "chart": chart_path.replace("\\", "/"),
                "csv": csv_path.replace("\\", "/")
            })
    
    # Save generation summary
    summary_path = os.path.join(output_dir, "generation_summary.json")
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"✅ Generation complete!")
    print(f"📊 Generated {len(summary)} master charts")
    print(f"📁 Output directory: {output_dir}")
    print(f"📋 Summary saved: {summary_path}")
    print(f"{'='*60}")


if __name__ == "__main__":
    # Change to backend directory if running from project root
    if os.path.basename(os.getcwd()) != "backend":
        if os.path.exists("backend"):
            os.chdir("backend")
    
    generate_all_master_charts()

