import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle
from typing import Dict, List, Tuple

# --- Data Definitions ------------------------------------------------------

STATIONS: List[Dict] = [
    {'id': 1, 'name': 'Bhusaval Jn', 'code': 'BSL', 'km': 0, 'category': 'junction', 'notes': 'Crew / Yard Control'},
    {'id': 2, 'name': 'Varangaon', 'code': 'VRJ', 'km': 18, 'category': 'block'},
    {'id': 3, 'name': 'Bodwad', 'code': 'BDWD', 'km': 43, 'category': 'block'},
    {'id': 4, 'name': 'Raver', 'code': 'RV', 'km': 61, 'category': 'crossing', 'notes': 'Crossing loop'},
    {'id': 5, 'name': 'Burhanpur', 'code': 'BAU', 'km': 74, 'category': 'junction', 'notes': 'Control Cabin'},
    {'id': 6, 'name': 'Nepanagar', 'code': 'NPNR', 'km': 98, 'category': 'crossing'},
    {'id': 7, 'name': 'Chhanera', 'code': 'CAER', 'km': 121, 'category': 'block'},
    {'id': 8, 'name': 'Khandwa Jn', 'code': 'KNW', 'km': 132, 'category': 'junction', 'notes': 'Division Boundary'},
]

BLOCK_SECTIONS: List[Dict] = [
    {'from': 1, 'to': 2, 'name': 'BSL - VRJ', 'length_km': 18, 'remarks': 'Double line'},
    {'from': 2, 'to': 3, 'name': 'VRJ - BDWD', 'length_km': 25},
    {'from': 3, 'to': 4, 'name': 'BDWD - RV', 'length_km': 18, 'remarks': 'Automatic block'},
    {'from': 4, 'to': 5, 'name': 'RV - BAU', 'length_km': 13, 'remarks': 'Neutral section'},
    {'from': 5, 'to': 6, 'name': 'BAU - NPNR', 'length_km': 24},
    {'from': 6, 'to': 7, 'name': 'NPNR - CAER', 'length_km': 23},
    {'from': 7, 'to': 8, 'name': 'CAER - KNW', 'length_km': 11, 'remarks': 'Approach controlled'},
]

SIGNALS: List[Dict] = [
    {'station': 1, 'direction': 'up', 'type': 'home'},
    {'station': 1, 'direction': 'up', 'type': 'starter'},
    {'station': 1, 'direction': 'down', 'type': 'home'},
    {'station': 1, 'direction': 'down', 'type': 'starter'},
    {'station': 2, 'direction': 'up', 'type': 'home'},
    {'station': 2, 'direction': 'up', 'type': 'starter'},
    {'station': 2, 'direction': 'down', 'type': 'home'},
    {'station': 2, 'direction': 'down', 'type': 'starter'},
    {'station': 3, 'direction': 'up', 'type': 'home'},
    {'station': 3, 'direction': 'down', 'type': 'home'},
    {'station': 4, 'direction': 'up', 'type': 'home'},
    {'station': 4, 'direction': 'up', 'type': 'starter'},
    {'station': 4, 'direction': 'down', 'type': 'home'},
    {'station': 4, 'direction': 'down', 'type': 'starter'},
    {'station': 5, 'direction': 'up', 'type': 'home'},
    {'station': 5, 'direction': 'up', 'type': 'starter'},
    {'station': 5, 'direction': 'down', 'type': 'home'},
    {'station': 5, 'direction': 'down', 'type': 'starter'},
    {'station': 6, 'direction': 'up', 'type': 'home'},
    {'station': 6, 'direction': 'down', 'type': 'home'},
    {'station': 7, 'direction': 'up', 'type': 'home'},
    {'station': 7, 'direction': 'down', 'type': 'home'},
    {'station': 8, 'direction': 'up', 'type': 'home'},
    {'station': 8, 'direction': 'up', 'type': 'starter'},
    {'station': 8, 'direction': 'down', 'type': 'home'},
    {'station': 8, 'direction': 'down', 'type': 'starter'},
]

TRAINS: List[Dict] = [
    {
        'number': '12812',
        'name': 'Amarkantak Express',
        'type': 'superfast',
        'direction': 'up',
        'schedule': [
            {'station': 1, 'arrival': '04:10', 'departure': '04:10', 'remarks': 'Right time start'},
            {'station': 2, 'arrival': '04:34', 'departure': '04:36'},
            {'station': 3, 'arrival': '05:05', 'departure': '05:07'},
            {'station': 4, 'arrival': '05:30', 'departure': '05:32'},
            {'station': 5, 'arrival': '06:03', 'departure': '06:06', 'crossing_with': '12811', 'remarks': 'Loop line halt'},
            {'station': 6, 'arrival': '06:26', 'departure': '06:28'},
            {'station': 7, 'arrival': '07:00', 'departure': '07:02'},
            {'station': 8, 'arrival': '07:25', 'departure': '07:25', 'remarks': 'Terminate at KNW'},
        ],
    },
    {
        'number': '22131',
        'name': 'Bhusaval Passenger',
        'type': 'passenger',
        'direction': 'up',
        'schedule': [
            {'station': 1, 'arrival': '06:10', 'departure': '06:10'},
            {'station': 2, 'arrival': '06:36', 'departure': '06:38'},
            {'station': 3, 'arrival': '07:10', 'departure': '07:13'},
            {'station': 4, 'arrival': '07:45', 'departure': '07:50', 'remarks': 'Crossing loop occupied'},
            {'station': 5, 'arrival': '08:25', 'departure': '08:35'},
            {'station': 6, 'arrival': '09:05', 'departure': '09:15'},
            {'station': 7, 'arrival': '09:55', 'departure': '10:00'},
            {'station': 8, 'arrival': '10:35', 'departure': '10:35'},
        ],
    },
    {
        'number': 'GDS-61',
        'name': 'Up Goods Special',
        'type': 'goods',
        'direction': 'up',
        'schedule': [
            {'station': 1, 'arrival': '09:45', 'departure': '09:45'},
            {'station': 2, 'arrival': '10:25', 'departure': '10:40'},
            {'station': 3, 'arrival': '11:25', 'departure': '11:55'},
            {'station': 4, 'arrival': '12:40', 'departure': '13:10'},
            {'station': 5, 'arrival': '14:00', 'departure': '14:30'},
            {'station': 6, 'arrival': '15:15', 'departure': '15:45', 'crossing_with': 'GDS-62'},
            {'station': 7, 'arrival': '16:30', 'departure': '17:00'},
            {'station': 8, 'arrival': '17:35', 'departure': '17:35'},
        ],
    },
    {
        'number': '12811',
        'name': 'Amarkantak Express',
        'type': 'superfast',
        'direction': 'down',
        'schedule': [
            {'station': 8, 'arrival': '05:05', 'departure': '05:05'},
            {'station': 7, 'arrival': '05:28', 'departure': '05:30'},
            {'station': 6, 'arrival': '05:58', 'departure': '06:00'},
            {'station': 5, 'arrival': '06:03', 'departure': '06:07', 'crossing_with': '12812'},
            {'station': 4, 'arrival': '06:58', 'departure': '07:00'},
            {'station': 3, 'arrival': '07:25', 'departure': '07:27'},
            {'station': 2, 'arrival': '07:55', 'departure': '07:57'},
            {'station': 1, 'arrival': '08:15', 'departure': '08:15', 'remarks': 'Arrival into BSL yard'},
        ],
    },
    {
        'number': '22132',
        'name': 'Khandwa Passenger',
        'type': 'passenger',
        'direction': 'down',
        'schedule': [
            {'station': 8, 'arrival': '09:45', 'departure': '09:45'},
            {'station': 7, 'arrival': '10:20', 'departure': '10:25'},
            {'station': 6, 'arrival': '10:55', 'departure': '11:05'},
            {'station': 5, 'arrival': '11:35', 'departure': '11:45'},
            {'station': 4, 'arrival': '12:15', 'departure': '12:22'},
            {'station': 3, 'arrival': '12:50', 'departure': '12:55'},
            {'station': 2, 'arrival': '13:20', 'departure': '13:25'},
            {'station': 1, 'arrival': '13:45', 'departure': '13:45'},
        ],
    },
    {
        'number': 'GDS-62',
        'name': 'Down Goods Special',
        'type': 'goods',
        'direction': 'down',
        'schedule': [
            {'station': 8, 'arrival': '11:10', 'departure': '11:10'},
            {'station': 7, 'arrival': '11:45', 'departure': '12:10'},
            {'station': 6, 'arrival': '12:45', 'departure': '13:15', 'crossing_with': 'GDS-61'},
            {'station': 5, 'arrival': '14:00', 'departure': '14:30'},
            {'station': 4, 'arrival': '15:05', 'departure': '15:35'},
            {'station': 3, 'arrival': '16:10', 'departure': '16:40'},
            {'station': 2, 'arrival': '17:15', 'departure': '17:45'},
            {'station': 1, 'arrival': '18:20', 'departure': '18:20'},
        ],
    },
]

# --- Helper Functions ------------------------------------------------------

STATION_LOOKUP = {station['id']: station for station in STATIONS}


def parse_minutes(value: str) -> int:
    hour, minute = map(int, value.split(':'))
    return hour * 60 + minute


def compute_time_range(trains: List[Dict]) -> Tuple[int, int]:
    mins: List[int] = []
    for train in trains:
        day_offset = 0
        last_value = -1
        for stop in train['schedule']:
            arrival = parse_minutes(stop['arrival'])
            if arrival + day_offset < last_value:
                day_offset += 1440
            mins.append(arrival + day_offset)
            last_value = arrival + day_offset
            departure = parse_minutes(stop['departure'])
            if stop['arrival'] != stop['departure']:
                if departure + day_offset < last_value:
                    day_offset += 1440
                mins.append(departure + day_offset)
                last_value = departure + day_offset
    lower = max(0, min(mins) - 20)
    upper = max(mins) + 20
    return lower, upper


def train_style(train: Dict) -> Tuple[str, Tuple[int, int] or None]:
    if train['type'] == 'goods':
        return '#16a34a', (7, 5)
    if train['direction'] == 'down':
        return '#2563eb', None
    return '#dc2626', None


def build_time_series(
    train: Dict,
) -> Tuple[
    List[int],
    List[int],
    List[Tuple[int, int, int]],
    List[Tuple[int, int, str]],
    List[Tuple[int, int]],
    Tuple[int, int],
]:
    times: List[int] = []
    kms: List[int] = []
    halts: List[Tuple[int, int, int]] = []
    crossings: List[Tuple[int, int, str]] = []
    arrows: List[Tuple[int, int]] = []

    day_offset = 0
    last_abs_time = -1

    for stop in train['schedule']:
        station = STATION_LOOKUP[stop['station']]
        arrival_minutes = parse_minutes(stop['arrival'])
        if arrival_minutes + day_offset < last_abs_time:
            day_offset += 1440
        arrival_abs = arrival_minutes + day_offset
        times.append(arrival_abs)
        kms.append(station['km'])
        last_abs_time = arrival_abs

        if stop['arrival'] != stop['departure']:
            departure_minutes = parse_minutes(stop['departure'])
            departure_abs = departure_minutes + day_offset
            if departure_abs < arrival_abs:
                departure_abs += 1440
            halts.append((arrival_abs, departure_abs, station['km']))
            last_abs_time = departure_abs

        if stop.get('crossing_with'):
            crossings.append((arrival_abs, station['km'], stop['crossing_with']))

    if times and kms:
        arrows.append((times[-1], kms[-1]))
        label_time = times[len(times) // 2]
        label_km = kms[len(kms) // 2]
        label_point = (label_time, label_km)
    else:
        label_point = (0, 0)

    return times, kms, halts, crossings, arrows, label_point


def minutes_to_hour_label(value: int) -> str:
    hours = (value // 60) % 24
    minutes = value % 60
    return f'{hours:02d}:{minutes:02d}'


def draw_signals(ax, time_min: int, station_positions: Dict[int, int]) -> None:
    offset_x = time_min - 80
    for signal in SIGNALS:
        y = station_positions[signal['station']]
        direction_offset = -10 if signal['direction'] == 'up' else 10
        marker_y = y + direction_offset
        if signal['type'] == 'home':
            ax.scatter(offset_x, marker_y, s=50, facecolors='none', edgecolors='#f97316', linewidths=1.4, zorder=5)
        elif signal['type'] == 'starter':
            ax.scatter(offset_x, marker_y, s=48, c='#facc15', marker='s', linewidths=0.8, edgecolors='#f59e0b', zorder=5)
        else:
            ax.scatter(offset_x, marker_y, s=55, c='#38bdf8', marker='^', edgecolors='#0ea5e9', linewidths=0.8, zorder=5)
    ax.text(offset_x, min(station_positions.values()) - 25, 'Signals', ha='center', va='center', fontsize=9, color='#475569')


def draw_block_sections(ax, time_min: int, station_positions: Dict[int, int]) -> None:
    x = time_min - 160
    for block in BLOCK_SECTIONS:
        y1 = station_positions[block['from']]
        y2 = station_positions[block['to']]
        mid = (y1 + y2) / 2
        ax.plot([x + 20, x + 20], [y1, y2], color='#94a3b8', linestyle=':', linewidth=1.2, zorder=1)
        label = block['name']
        detail = f"{block['length_km']} km"
        if block.get('remarks'):
            detail += f" • {block['remarks']}"
        ax.text(x, mid - 6, label, ha='left', va='center', fontsize=9, color='#334155')
        ax.text(x, mid + 8, detail, ha='left', va='center', fontsize=8, color='#64748b')
    ax.text(x + 20, min(station_positions.values()) - 45, 'Block Sections', ha='center', va='center', fontsize=9, color='#475569')


def draw_station_guides(ax, time_min: int, time_max: int, station_positions: Dict[int, int]) -> None:
    for station in STATIONS:
        y = station_positions[station['id']]
        ax.hlines(y, time_min - 40, time_max + 40, colors='#cbd5f5', linestyles='--', linewidth=0.8, zorder=0)
        ax.scatter(time_min - 20, y, s=28, c='#0f172a', zorder=4)
        label_lines = [station['name'], f"{station['code']} • {station['km']} km"]
        if station.get('notes'):
            label_lines.append(station['notes'])
        for idx, line in enumerate(label_lines):
            ax.text(
                time_min - 60,
                y - 18 + idx * 12,
                line,
                ha='right',
                va='center',
                fontsize=9 if idx == 0 else 8,
                color='#1f2937' if idx == 0 else '#64748b',
            )
        if station['category'] == 'crossing':
            ax.text(time_min - 18, y + 12, '✶', color='#f59e0b', fontsize=11, ha='center', va='center')


def plot_train(ax, train: Dict, time_min: int, time_max: int) -> None:
    station_positions = {station['id']: station['km'] for station in STATIONS}
    color, dash = train_style(train)
    times, kms, halts, crossings, arrows, label_point = build_time_series(train)

    ax.plot(times, kms, color=color, linewidth=2.2, linestyle='--' if dash else '-', zorder=3, solid_capstyle='round')

    ax.scatter(times, kms, s=28, c=color, edgecolors='#ffffff', linewidths=0.8, zorder=4)
    ax.scatter(times[:1], kms[:1], s=36, facecolors='#ffffff', edgecolors=color, linewidths=1.6, zorder=5)

    for start, end, km in halts:
        ax.hlines(km, start, end, colors=color, linewidth=3.5, zorder=5)

    for x, y, partner in crossings:
        ax.text(x, y, '✗', fontsize=11, color='#0f172a', ha='center', va='center', zorder=6)
        ax.text(x, y - 10, partner, ha='center', va='bottom', fontsize=7, color='#1f2937', zorder=6)

    for x, y in arrows:
        direction = 1 if train['direction'] == 'up' else -1
        ax.annotate(
            '',
            xy=(x + direction * 18, y + (direction * -4)),
            xytext=(x, y),
            arrowprops=dict(arrowstyle='-|>', color=color, lw=1.6),
            zorder=6,
        )

    if label_point != (0, 0):
        label_width = 80
        label_height = 24
        rect = Rectangle(
            (label_point[0] - label_width / 2, label_point[1] - label_height / 2),
            label_width,
            label_height,
            facecolor='#f8fafc',
            edgecolor=color,
            linewidth=0.9,
            zorder=6,
        )
        ax.add_patch(rect)
        ax.text(
            label_point[0],
            label_point[1] - 4,
            f"{train['number']}",
            ha='center',
            va='center',
            fontsize=8.5,
            color='#0f172a',
            fontweight='bold',
            zorder=7,
        )
        ax.text(
            label_point[0],
            label_point[1] + 6,
            train['name'],
            ha='center',
            va='center',
            fontsize=7.5,
            color='#475569',
            zorder=7,
        )


def build_legend(ax):
    legend_handles = [
        Line2D([0], [0], color='#dc2626', lw=2.2, label='Up Express / Passenger'),
        Line2D([0], [0], color='#2563eb', lw=2.2, label='Down Express / Passenger'),
        Line2D([0], [0], color='#16a34a', lw=2.2, ls='--', label='Goods / Freight'),
        Line2D([0], [0], color='#0f172a', lw=0, marker='|', markersize=10, label='Train Halt'),
        Line2D([0], [0], color='#0f172a', lw=0, marker='x', markersize=8, label='Crossing / Meet'),
    ]
    ax.legend(
        handles=legend_handles,
        loc='upper right',
        title='Legend / सांकेतिक चिन्ह',
        fontsize=9,
        title_fontsize=10,
        frameon=True,
    )


def plot_master_chart():
    time_min, time_max = compute_time_range(TRAINS)

    fig, ax = plt.subplots(figsize=(18, 12), dpi=110)
    fig.patch.set_facecolor('#e2e8f0')
    ax.set_facecolor('#f8fafc')

    station_positions = {station['id']: station['km'] for station in STATIONS}

    draw_station_guides(ax, time_min, time_max, station_positions)
    draw_block_sections(ax, time_min, station_positions)
    draw_signals(ax, time_min, station_positions)

    for train in TRAINS:
        plot_train(ax, train, time_min, time_max)

    ax.set_xlim(time_min, time_max)
    ax.set_ylim(max(station_positions.values()) + 10, min(station_positions.values()) - 10)

    hour_ticks = list(range((time_min // 60) * 60, time_max + 60, 60))
    ax.set_xticks(hour_ticks)
    ax.set_xticklabels([minutes_to_hour_label(tick) for tick in hour_ticks], rotation=45, ha='right', fontsize=9)
    ax.set_xlabel('समय / Time (HH:MM)', fontsize=12, color='#0f172a')

    ax.set_ylabel('Block Sections • Distance in km', fontsize=12, color='#0f172a')
    ax.set_yticks([station['km'] for station in STATIONS])
    ax.set_yticklabels([f"{station['code']} ({station['km']} km)" for station in STATIONS], fontsize=9, color='#1f2937')

    ax.grid(axis='x', color='#cbd5f5', linestyle=':', linewidth=0.8)

    ax.set_title('मास्टर चार्ट (Master Chart)\nBhusaval Jn ⇄ Khandwa Jn Control Diagram', fontsize=16, fontweight='bold', color='#111827', pad=18)

    build_legend(ax)

    plt.tight_layout()
    plt.show()


if __name__ == '__main__':
    plot_master_chart()

