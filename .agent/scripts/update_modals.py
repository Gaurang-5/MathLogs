import sys

filepath = 'client/src/pages/BatchDetails.tsx'

with open(filepath, 'r') as f:
    content = f.read()

content = content.replace('!bg-white border border-app-border rounded-[24px]', '!bg-white border-[1.5px] border-black/5 rounded-[32px]')
content = content.replace('className="bg-white border border-neutral-200 rounded-[24px]', 'className="bg-white border-[1.5px] border-black/5 rounded-[32px]')

with open(filepath, 'w') as f:
    f.write(content)

print("Updated modals")
