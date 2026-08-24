#!/usr/bin/env python3
"""
build.py — Run this after editing any tab or JS file to regenerate index.html.
Usage: python build.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TABS = os.path.join(HERE, 'tabs')

def r(fname):
    with open(os.path.join(TABS, fname), encoding='utf-8') as f:
        return f.read()

index = (
    r('head.html') +
    r('tab_today.html') +
    r('tab_food.html') +
    r('tab_focus.html') +
    r('tab_money.html') +
    r('tab_sleep.html') +
    r('tab_calendar.html') +
    r('tab_stats.html') +
    r('tab_history.html') +
    r('tab_people.html') +
    r('tab_goals.html') +
    r('tab_car.html') +
    r('tab_parts.html') +
    '\n</div><!-- /app -->\n' +
    r('modals.html') +
    r('modals_parts.html') +
    r('js_core.js') +
    r('js_pomo.js') +
    r('js_food.js') +
    r('js_money.js') +
    r('js_calendar.js') +
    r('js_sleep.js') +
    r('js_people.js') +
    r('jalali.js') +
    r('js_parts.js') +
    r('js_goals.js') +
    r('js_car.js') +
    r('js_close.txt')
)

out = os.path.join(HERE, 'index.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(index)
print(f'✅  index.html rebuilt ({len(index):,} bytes)')
