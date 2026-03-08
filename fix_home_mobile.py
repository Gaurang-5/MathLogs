import re

with open('/Users/gaurangbhatia/Desktop/new_project/client/src/pages/Home.tsx', 'r') as f:
    content = f.read()

# Feature 1 (Batch Management)
# Let's wrap the dashboard inner content with overflow-x-auto
feature1_body = re.search(r'(<!-- Batch Header Card -->.*?)(?=</motion\.div>)', content, re.DOTALL)
# Wait, the comments are {/* Batch Header Card */}
