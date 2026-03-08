import re

with open('/Users/gaurangbhatia/Desktop/new_project/client/src/pages/Home.tsx', 'r') as f:
    content = f.read()

# Make things responsive, replace hardcoded widths/heights that break mobile
content = re.sub(r'w-\[([0-9]+)px\]', r'w-full max-w-[\1px]', content)

# But wait, sometimes we explicitly want a fixed width for an icon or a specific container.
# E.g., w-[52px], w-[40px] are fine. What breaks are w-[860px], w-[280px] etc.

# Let's see the large hardcoded widths:
large_widths = re.findall(r'w-\[([0-9]{3,})px\]', content)
print("Large widths:", set(large_widths))

