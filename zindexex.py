import json
import os

# Load indexes from JSON file
with open('firestore.indexes.json') as f:
    data = json.load(f)

# Iterate through the indexes and create gcloud commands
for index in data['indexes']:
    collection_group = index['collectionGroup']
    field_configs = index['fields']
    
    field_config_strs = []
    for field_config in field_configs:
        if 'order' in field_config:
            field_config_str = f"field-path={field_config['fieldPath']},order={field_config['order']}"
        elif 'arrayConfig' in field_config:
            field_config_str = f"field-path={field_config['fieldPath']},array-config={field_config['arrayConfig']}"
        else:
            continue
        field_config_strs.append(field_config_str)
    
    field_config_args = " --field-config=".join(field_config_strs)
    command = f"gcloud firestore indexes composite create --collection-group={collection_group} --field-config={field_config_args} --database=pre-prod --project=akd-prod --async"
    print(command)
    os.system(command)
