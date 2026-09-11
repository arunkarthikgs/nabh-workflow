#!/bin/bash

# If no commit message is provided, ask for it
if [ -z "$1" ]; then
    read -p "Enter commit message: " COMMIT_MESSAGE
else
    COMMIT_MESSAGE="$*"
fi

# Export the commit message so the deploy script can use it
export COMMIT_MESSAGE

# Run your NABH deploy script
/Users/vkartsu/SFTPConfig/nabh-workflow/nabh-docs/scripts/commit-push-deploy.sh
