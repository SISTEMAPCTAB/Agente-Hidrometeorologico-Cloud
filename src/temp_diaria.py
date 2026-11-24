"""Máxima y mínima del día por estación WeatherLink (24-nov-2026; Modelo V111fd: seguimiento de récords y sensación térmica).
Cada corrida (cada 30 min) actualiza en el estado de la estación la máxima/mínima del día local (00-24 h) y la sensación térmica máxima
(índice de calor NOAA, Rothfusz), con su hora; el día anterior se conserva como 'ayer'. Sólo lecturas nuevas y de <= 2 h."""
from datetime import timedelta

def _hi(tc, rh):
    t = tc * 9 / 5 + 32
    if t < 80 or rh is None or rh < 40:
        return tc
    hi = (-42.379 + 2.04901523 * t + 10.14333127 * rh - .22475541 * t * rh - .00683783 * t * t - .05481717 * rh * rh
          + .00122874 * t * t * rh + .00085282 * t * rh * rh - .00000199 * t * t * rh * rh)
    return (hi - 32) * 5 / 9

def actualizar(st, obs, now, tz):
    """st: estado de la estación (dict, se modifica); obs: lectura con temperature_f, humidity_pct, observed_utc. Devuelve campos para el item."""
    try:
        tf = obs.get('temperature_f'); rh = obs.get('humidity_pct'); ob = obs.get('observed_utc')
        if tf is None or ob is None or (now - ob) > timedelta(hours=2):
            raise ValueError
        tc = round((float(tf) - 32) * 5 / 9, 1)
        if not (-5 < tc < 55):
            raise ValueError
        loc = ob.astimezone(tz); dia = loc.strftime('%Y-%m-%d'); hora = loc.strftime('%H:%M')
        T = st.get('temp_dia') or {}
        if T.get('fecha') != dia:
            if T.get('fecha'):
                st['temp_ayer'] = T
            T = {'fecha': dia, 'desde': hora}
        if T.get('max_c') is None or tc > T['max_c']:
            T['max_c'], T['max_hora'] = tc, hora
        if T.get('min_c') is None or tc < T['min_c']:
            T['min_c'], T['min_hora'] = tc, hora
        h = round(_hi(tc, float(rh)) if rh is not None else tc, 1)
        if T.get('st_max_c') is None or h > T['st_max_c']:
            T['st_max_c'], T['st_max_hora'], T['st_hr'] = h, hora, rh
        T.setdefault('desde', hora)
        T['n'] = int(T.get('n', 0)) + 1
        st['temp_dia'] = T
    except Exception:
        pass
    out = {'temp_dia': st.get('temp_dia')}
    if st.get('temp_ayer'):
        out['temp_ayer'] = st['temp_ayer']
    return out
