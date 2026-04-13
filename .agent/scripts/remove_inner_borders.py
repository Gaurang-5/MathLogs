import sys

filepath = 'client/src/pages/BatchDetails.tsx'

with open(filepath, 'r') as f:
    text = f.read()

# Remove the inner border boxes from the modals
# "space-y-4 p-4 border-2 border-black rounded-2xl bg-white" -> "space-y-4"
text = text.replace('className="space-y-4 p-4 border-2 border-black rounded-2xl bg-white"', 'className="space-y-4"')

with open(filepath, 'w') as f:
    f.write(text)

print("Inner modal borders removed")
