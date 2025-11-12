# Railway Zonal Master Chart Generator

This script generates Railway Zonal Master Chart-style line graphs showing train movements for each Zone and its Divisions, replicating the format used in Indian Railway control rooms.

## Features

- **Multi-line Time-Distance Charts**: Visualizes train movements with:
  - 🔵 Blue lines for Goods trains (Maal Gaadi)
  - 🟢 Green lines for Passenger trains
  - 🔴 Red lines for Express/Mail trains

- **Data Sources Support**:
  - PDF extraction (if PDF files provided in `inputs/` directory)
  - Image OCR extraction (if Master Chart images provided in `inputs/` directory)
  - Simulated data based on Indian Railway zones/divisions (fallback)

- **Comprehensive Coverage**: Generates charts for all 18 Indian Railway zones and their divisions

## Usage

### Basic Usage

```bash
cd backend
python generate_master_charts.py
```

### With Input Files

1. Place PDF files or Master Chart images in the `backend/inputs/` directory
2. Run the script:
   ```bash
   python generate_master_charts.py
   ```
3. The script will:
   - Attempt to extract data from PDF/image files
   - Fall back to simulated data if extraction fails or files are not available
   - Generate charts and CSV summaries for all zones

### Output

The script generates:
- **Charts**: PNG files saved to `backend/outputs/master_charts/`
- **CSV Summaries**: Detailed train movement data for each zone/division
- **Summary JSON**: `generation_summary.json` listing all generated files

## Output Format

### Chart Features

- **X-axis**: Distance (km) - Station sequence
- **Y-axis**: Time (24-hour format)
- **Lines**: Multiple trains of each type showing time-distance relationships
- **Station Markers**: Vertical lines and labels for key stations
- **Grid**: Professional gridlines for easy reading
- **Legend**: Color-coded train types

### CSV Format

Each CSV contains:
- `station`: Station name
- `distance`: Distance from origin (km)
- `arrival`: Arrival time (HH:MM:SS)
- `departure`: Departure time (HH:MM:SS)
- `train_type`: goods, passenger, or express
- `train_number`: Unique train identifier

## Requirements

Install dependencies:

```bash
pip install -r requirements.txt
```

Key dependencies:
- `matplotlib` - Chart generation
- `pandas` - Data processing
- `numpy` - Numerical operations
- `PyPDF2` - PDF extraction (optional)
- `Pillow` & `pytesseract` - Image OCR (optional)

**Note**: For OCR functionality, you also need to install Tesseract OCR:
- Windows: Download from [GitHub](https://github.com/UB-Mannheim/tesseract/wiki)
- Linux: `sudo apt-get install tesseract-ocr`
- macOS: `brew install tesseract`

## Zones Covered

The script generates charts for all major Indian Railway zones:

1. Central Railway (Mumbai, Nagpur)
2. Eastern Railway (Howrah-I, Howrah-II)
3. East Central Railway (Danapur, Mugalsarai)
4. East Coast Railway (Khurda Road, Waltair)
5. Northern Railway (Delhi-I, Delhi-II)
6. North Central Railway (Allahabad, Jhansi)
7. North Eastern Railway (Izzatnagar, Lucknow)
8. North Frontier Railway (Katihar, Alipurduar)
9. North Western Railway (Jaipur, Jodhpur)
10. Southern Railway (Chennai, Madurai)
11. South Central Railway (Secunderabad, Hyderabad)
12. South Eastern Railway (Kharagpur, Adra)
13. South East Central Railway (Bilaspur, Nagpur)
14. South Western Railway (Bangalore, Mysore)
15. Western Railway (BCT, Vadodara)
16. West Central Railway (Jabalpur, Bhopal)

## Customization

### Modifying Train Characteristics

Edit the `train_configs` in `simulate_train_data()` function:

```python
train_configs = [
    {"type": "goods", "speed_kmph": 45, "stop_time_min": 15, "num_trains": 3, "start_times": [6, 8, 10]},
    {"type": "passenger", "speed_kmph": 60, "stop_time_min": 5, "num_trains": 3, "start_times": [7, 9, 11]},
    {"type": "express", "speed_kmph": 80, "stop_time_min": 3, "num_trains": 2, "start_times": [6.5, 8.5]}
]
```

### Adding Custom Stations

Modify the `RAILWAY_ZONES` dictionary in the script to add or modify stations for any zone/division.

## Example Output

```
✅ Chart saved: outputs/master_charts/Central_Railway_Mumbai_chart.png
✅ CSV saved: outputs/master_charts/Central_Railway_Mumbai_summary.csv
```

## Notes

- Charts are generated at 300 DPI for high-quality printing
- All times are in 24-hour format
- Distances are approximate and based on typical Indian Railway routes
- Simulated data uses realistic train speeds and stop times

