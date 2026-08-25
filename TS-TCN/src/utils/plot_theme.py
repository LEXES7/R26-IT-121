"""DeepSentinel plotting theme (consistent across notebooks)."""
import matplotlib.pyplot as plt

COLORS = {
    "blue":   "#1A5276",
    "red":    "#C0392B",
    "green":  "#1E8449",
    "orange": "#D35400",
    "purple": "#6C3483",
    "grey":   "#7F8C8D",
}


def apply_theme():
    """Apply the DeepSentinel plot style to matplotlib globally."""
    plt.rcParams.update({
        "figure.facecolor": "white",
        "axes.facecolor":   "#F9F9F9",
        "axes.edgecolor":   "#333333",
        "axes.labelcolor":  "#222222",
        "xtick.color":      "#333333",
        "ytick.color":      "#333333",
        "axes.spines.top":   False,
        "axes.spines.right": False,
        "font.family": "DejaVu Sans",
        "font.size":   11,
        "axes.grid":     True,
        "grid.color":    "#E0E0E0",
        "grid.linestyle": "--",
        "grid.alpha":    0.6,
    })
