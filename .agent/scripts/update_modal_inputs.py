import sys

filepath = 'client/src/pages/BatchDetails.tsx'

with open(filepath, 'r') as f:
    text = f.read()

# Unified inputs / borders inside modals
text = text.replace('border border-app-border', 'border-[1.5px] border-black/5')
text = text.replace('border-t border-app-border', 'border-t border-black/5')
text = text.replace('border-b border-app-border', 'border-b border-black/5')
text = text.replace('border-app-border', 'border-black/5')


text = text.replace('bg-app-bg', 'bg-white')
text = text.replace('bg-app-surface', 'bg-neutral-50/50')
text = text.replace('bg-app-surface-hover', 'bg-neutral-100/50')

with open(filepath, 'w') as f:
    f.write(text)

print("Batch form inputs updated")
