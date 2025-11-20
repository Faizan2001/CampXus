#!/usr/bin/env python3
"""
Analyze Firestore database dump to extract statistics
"""
import json
from collections import Counter, defaultdict
from datetime import datetime

def analyze_database(file_path):
    """Load and analyze the firestore database dump"""
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    users = data.get('users', {})
    friend_requests = data.get('friendRequests', {})
    friendships = data.get('friendships', {})
    
    # Initialize statistics
    stats = {
        'total_users': len(users),
        'majors': Counter(),
        'starting_years': Counter(),
        'universities': Counter(),
        'profile_setup_complete': 0,
        'profile_setup_incomplete': 0,
        'users_with_schedule': 0,
        'users_without_schedule': 0,
        'location_sharing_enabled': 0,
        'location_sharing_disabled': 0,
        'campus_presence_visible': 0,
        'campus_presence_hidden': 0,
        'privacy_levels': Counter(),
        'searchable_users': 0,
        'non_searchable_users': 0,
        'total_friend_requests': len(friend_requests),
        'pending_friend_requests': 0,
        'total_friendships': len(friendships),
        'users_with_friends': 0,
        'fcm_tokens_count': 0,
        'pwa_users': 0,
        'platforms': Counter(),
        'status_online': 0,
        'status_offline': 0,
        'users_on_campus': 0,
        'users_off_campus': 0,
        'total_classes_count': 0,
        'avg_classes_per_student': 0,
    }
    
    # Analyze users
    total_classes = 0
    users_with_classes = 0
    
    for uid, user in users.items():
        # Major statistics
        if 'profile' in user and 'major' in user['profile']:
            major = user['profile']['major']
            stats['majors'][major] += 1
        
        # Starting year
        if 'profile' in user and 'startingYear' in user['profile']:
            year = user['profile']['startingYear']
            stats['starting_years'][year] += 1
        
        # University
        if 'universityInfo' in user and 'university' in user['universityInfo']:
            university = user['universityInfo']['university']
            stats['universities'][university] += 1
        
        # Profile setup
        if 'systemInfo' in user and user['systemInfo'].get('profileSetupComplete'):
            stats['profile_setup_complete'] += 1
        else:
            stats['profile_setup_incomplete'] += 1
        
        # Schedule data
        has_schedule = False
        if 'scheduleData' in user and 'metadata' in user['scheduleData']:
            if not user['scheduleData']['metadata'].get('isEmpty', True):
                stats['users_with_schedule'] += 1
                has_schedule = True
                
                # Count classes
                total = user['scheduleData']['metadata'].get('totalClasses', 0)
                if total > 0:
                    total_classes += total
                    users_with_classes += 1
        
        if not has_schedule:
            stats['users_without_schedule'] += 1
        
        # Location sharing
        if 'systemInfo' in user:
            if user['systemInfo'].get('locationSharingEnabled'):
                stats['location_sharing_enabled'] += 1
            else:
                stats['location_sharing_disabled'] += 1
            
            # Status
            if user['systemInfo'].get('status') == 'online':
                stats['status_online'] += 1
            else:
                stats['status_offline'] += 1
            
            # Campus presence
            if 'lastKnownLocation' in user['systemInfo']:
                loc = user['systemInfo']['lastKnownLocation']
                if loc.get('campusStatus') == 'on_campus':
                    stats['users_on_campus'] += 1
                elif loc.get('campusStatus') == 'off_campus':
                    stats['users_off_campus'] += 1
        
        # Social info
        if 'socialInfo' in user:
            # Privacy
            privacy = user['socialInfo'].get('privacy', 'unknown')
            stats['privacy_levels'][privacy] += 1
            
            # Searchable
            if user['socialInfo'].get('searchable'):
                stats['searchable_users'] += 1
            else:
                stats['non_searchable_users'] += 1
            
            # Campus presence visibility
            if user['socialInfo'].get('campusPresenceVisible'):
                stats['campus_presence_visible'] += 1
            else:
                stats['campus_presence_hidden'] += 1
            
            # Friends count
            if user['socialInfo'].get('friendsCount', 0) > 0:
                stats['users_with_friends'] += 1
        
        # FCM tokens (push notifications)
        if 'fcmTokens' in user:
            stats['fcm_tokens_count'] += len(user['fcmTokens'])
            
            # Platform analysis
            for token_data in user['fcmTokens'].values():
                if token_data.get('platform'):
                    stats['platforms'][token_data['platform']] += 1
                if token_data.get('isPWA'):
                    stats['pwa_users'] += 1
    
    # Analyze friend requests
    for req_id, req in friend_requests.items():
        if req.get('status') == 'pending':
            stats['pending_friend_requests'] += 1
    
    # Calculate averages
    if users_with_classes > 0:
        stats['avg_classes_per_student'] = round(total_classes / users_with_classes, 2)
    stats['total_classes_count'] = total_classes
    
    return stats

def print_statistics(stats):
    """Print statistics in a readable format"""
    print("=" * 60)
    print("CAMPXUS DATABASE STATISTICS")
    print("=" * 60)
    
    print(f"\n📊 OVERALL STATISTICS")
    print(f"   Total Users: {stats['total_users']}")
    print(f"   Total Friend Requests: {stats['total_friend_requests']}")
    print(f"   Pending Friend Requests: {stats['pending_friend_requests']}")
    print(f"   Total Friendships: {stats['total_friendships']}")
    
    print(f"\n🎓 MAJORS DISTRIBUTION")
    print(f"   {'Major':<10} {'Count':<10} {'Percentage':<10}")
    print(f"   {'-'*30}")
    sorted_majors = sorted(stats['majors'].items(), key=lambda x: x[1], reverse=True)
    for major, count in sorted_majors:
        percentage = (count / stats['total_users']) * 100
        print(f"   {major:<10} {count:<10} {percentage:>6.2f}%")
    
    print(f"\n📅 STARTING YEAR DISTRIBUTION")
    print(f"   {'Year':<10} {'Count':<10} {'Percentage':<10}")
    print(f"   {'-'*30}")
    sorted_years = sorted(stats['starting_years'].items())
    for year, count in sorted_years:
        percentage = (count / stats['total_users']) * 100
        print(f"   {year:<10} {count:<10} {percentage:>6.2f}%")
    
    print(f"\n🏫 UNIVERSITY DISTRIBUTION")
    for university, count in stats['universities'].items():
        percentage = (count / stats['total_users']) * 100
        print(f"   {university}: {count} ({percentage:.2f}%)")
    
    print(f"\n✅ PROFILE STATUS")
    print(f"   Profile Setup Complete: {stats['profile_setup_complete']} ({(stats['profile_setup_complete']/stats['total_users']*100):.2f}%)")
    print(f"   Profile Setup Incomplete: {stats['profile_setup_incomplete']} ({(stats['profile_setup_incomplete']/stats['total_users']*100):.2f}%)")
    
    print(f"\n📚 SCHEDULE DATA")
    print(f"   Users with Schedule: {stats['users_with_schedule']} ({(stats['users_with_schedule']/stats['total_users']*100):.2f}%)")
    print(f"   Users without Schedule: {stats['users_without_schedule']} ({(stats['users_without_schedule']/stats['total_users']*100):.2f}%)")
    print(f"   Total Classes Across All Users: {stats['total_classes_count']}")
    print(f"   Average Classes per Student (with classes): {stats['avg_classes_per_student']}")
    
    print(f"\n📍 LOCATION & PRESENCE")
    print(f"   Location Sharing Enabled: {stats['location_sharing_enabled']} ({(stats['location_sharing_enabled']/stats['total_users']*100):.2f}%)")
    print(f"   Location Sharing Disabled: {stats['location_sharing_disabled']} ({(stats['location_sharing_disabled']/stats['total_users']*100):.2f}%)")
    print(f"   Users On Campus: {stats['users_on_campus']}")
    print(f"   Users Off Campus: {stats['users_off_campus']}")
    print(f"   Campus Presence Visible: {stats['campus_presence_visible']} ({(stats['campus_presence_visible']/stats['total_users']*100):.2f}%)")
    print(f"   Campus Presence Hidden: {stats['campus_presence_hidden']} ({(stats['campus_presence_hidden']/stats['total_users']*100):.2f}%)")
    
    print(f"\n🔒 PRIVACY SETTINGS")
    print(f"   {'Level':<15} {'Count':<10} {'Percentage':<10}")
    print(f"   {'-'*35}")
    for level, count in stats['privacy_levels'].items():
        percentage = (count / stats['total_users']) * 100
        print(f"   {level:<15} {count:<10} {percentage:>6.2f}%")
    print(f"   Searchable Users: {stats['searchable_users']} ({(stats['searchable_users']/stats['total_users']*100):.2f}%)")
    print(f"   Non-Searchable Users: {stats['non_searchable_users']} ({(stats['non_searchable_users']/stats['total_users']*100):.2f}%)")
    
    print(f"\n👥 SOCIAL ENGAGEMENT")
    print(f"   Users with Friends: {stats['users_with_friends']} ({(stats['users_with_friends']/stats['total_users']*100):.2f}%)")
    
    print(f"\n💻 PLATFORM & TECHNOLOGY")
    print(f"   Total FCM Tokens (Push Notifications): {stats['fcm_tokens_count']}")
    print(f"   PWA Users: {stats['pwa_users']}")
    print(f"   Platform Distribution:")
    for platform, count in stats['platforms'].items():
        print(f"      {platform}: {count}")
    
    print(f"\n🟢 USER STATUS")
    print(f"   Online: {stats['status_online']} ({(stats['status_online']/stats['total_users']*100):.2f}%)")
    print(f"   Offline: {stats['status_offline']} ({(stats['status_offline']/stats['total_users']*100):.2f}%)")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    import sys
    
    file_path = "/home/faizan/Desktop/CampXus/firestore_dump.json"
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    
    print(f"Analyzing database: {file_path}")
    print("Loading data...\n")
    
    stats = analyze_database(file_path)
    print_statistics(stats)
