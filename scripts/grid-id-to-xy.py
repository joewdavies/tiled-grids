import pandas as pd
import re

# Function to extract X and Y from the GRD_ID field and remove 3 trailing zeros
def extract_coordinates(grd_id):
    y_match = re.search(r'N(\d+)', grd_id)
    x_match = re.search(r'E(\d+)', grd_id)
    
    if y_match and x_match:
        y = y_match.group(1)
        x = x_match.group(1)

        # Check if Y has at least 3 trailing zeros
        # if y.endswith('000'):
           #y = y[:-3]  # Remove the trailing 000
        # else:
            # print(f"Warning: Y value '{y}' does not have 3 trailing zeros.")

        # Check if X has at least 3 trailing zeros
        # if x.endswith('000'):
            #x = x[:-3]  # Remove the trailing 000
        # else:
            # print(f"Warning: X value '{x}' does not have 3 trailing zeros.")

        return pd.Series([x, y])
    else:
        return pd.Series([None, None])

# Read the CSV file
input_file = 'CLUSTERS.csv'  # Replace with your actual file path
df = pd.read_csv(input_file)

# Apply the extraction function to the GRD_ID field
df[['X', 'Y']] = df['GRD_ID'].apply(extract_coordinates)

# Drop the GRD_ID column
df = df.drop(columns=['GRD_ID'])

# Save the updated DataFrame to a new CSV file
output_file = 'clusters_cleaned.csv'  # Replace with your desired output file path
df.to_csv(output_file, index=False)

print(f"Conversion complete. New CSV saved as {output_file}.")
