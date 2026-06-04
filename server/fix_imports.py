import re
from collections import defaultdict

with open('src/routes/api.ts', 'r') as f:
    lines = f.readlines()

imports = defaultdict(set)
other_lines = []

import_regex = re.compile(r'^import\s+{(.+?)}\s+from\s+[\'"](.+?)[\'"];')
default_import_regex = re.compile(r'^import\s+([a-zA-Z0-9_]+)\s+from\s+[\'"](.+?)[\'"];')

skip = False
for line in lines:
    m = import_regex.match(line.strip())
    if m:
        items = [x.strip() for x in m.group(1).split(',')]
        module = m.group(2)
        imports[module].update(items)
        continue
        
    m2 = default_import_regex.match(line.strip())
    if m2:
        item = m2.group(1)
        module = m2.group(2)
        imports[module].add("default:" + item)
        continue
        
    # Ignore empty lines at the very beginning of the "other_lines"
    if not line.strip() and not other_lines:
        continue
        
    other_lines.append(line)

out_lines = []
for module, items in imports.items():
    defaults = [x.split(':')[1] for x in items if x.startswith("default:")]
    named = sorted([x for x in items if not x.startswith("default:")])
    
    import_parts = []
    if defaults:
        import_parts.append(defaults[0])
    if named:
        import_parts.append("{ " + ", ".join(named) + " }")
        
    out_lines.append(f"import {', '.join(import_parts)} from '{module}';\n")

out_lines.append("\n")

while other_lines and not other_lines[0].strip():
    other_lines.pop(0)

out_lines.extend(other_lines)

with open('src/routes/api.ts', 'w') as f:
    f.writelines(out_lines)

print("Imports fixed!")
