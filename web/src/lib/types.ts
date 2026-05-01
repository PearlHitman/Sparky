export interface SparkUser {
  id: string;
  instagram_username: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  instagram_username: string;
  full_name: string | null;
  display_name: string | null;
  profile_pic_url: string | null;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  instagram_thread_id: string;
  instagram_thread_v2_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  participant_usernames: string | null;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  instagram_message_id: string;
  sender_username: string | null;
  message_text: string | null;
  sent_at: string | null;
  synced_at: string;
}
