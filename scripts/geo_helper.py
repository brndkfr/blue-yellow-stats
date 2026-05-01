"""Distance calculations from Kloten Stighag for the Road Warrior Index."""

import math

# Stiftung Sporthalle Stighag, Kloten — Jets home venue
_HOME_LAT = 47.4490
_HOME_LNG = 8.5990


def haversine_km(lat: float, lng: float) -> float:
    """Great-circle distance in km from the Jets home venue to (lat, lng)."""
    r = 6371.0
    phi1, phi2 = math.radians(_HOME_LAT), math.radians(lat)
    dphi = math.radians(lat - _HOME_LAT)
    dlam = math.radians(lng - _HOME_LNG)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return r * 2 * math.asin(math.sqrt(a))
