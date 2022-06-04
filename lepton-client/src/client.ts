import { Post, PostData } from "./post";
import { User, UserData } from "./user";
import { Comment, CommentData } from "./comment";
import { Group } from "./group";
import { ClientUser } from "./clientuser";
import { EventEmitter } from "events";
import { fetch } from "cross-fetch";
import { io } from "socket.io-client";
import { CREATE_POST_URL, GET_COMMENTS_URL, GET_POSTS_URL, GET_SELF_URL, SIGN_IN_URL, SIGN_UP_URL } from "./constants";
import { Settings } from "./types";

const URL = process.env.NODE_ENV === "development" ? "/api/socket" : "wss://idk lmao";

export function signedIn(isSignedIn = true) {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;
		descriptor.value = function (this: Client | { client: Client }, ...args: any[]): any {
			let client: Client;
			if ("client" in this) {
				client = this.client;
			} else {
				client = this;
			}
			if (isSignedIn) {
				if (!client.clientUser) {
					throw new Error("You must be signed in to use this function");
				}
			} else if (!isSignedIn) {
				if (client.clientUser) {
					throw new Error();
				}
			}
			return originalMethod.apply(this, args);
		};
	};
}

export class Client extends EventEmitter {
	commentsCache = new Map<string, Comment>();
	postsCache = new Map<string, Post>();
	usersCache = new Map<string, User>();
	groupsCache = new Map<string, Group>();

	token?: string;
	clientUser?: ClientUser;

	async getPosts(props: { before: number }): Promise<Post[]>;
	async getPosts(): Promise<Post[]>;
	async getPosts(props?: { before: number }) {
		const { posts, users }: { posts: PostData[]; users: UserData[] } = await fetch(
			GET_POSTS_URL + (props?.before ? `?before=${props.before}` : "")
		).then((e) => e.json());

		for (const userid in users) {
			User.from(this, users[userid]);
		}

		let createdPosts = [];
		for (const post of posts) {
			createdPosts.push(Post.from(this, post));
		}
		// after we do comments we do here

		return createdPosts;
	}

	async getComments(props: {post: string, before?: number}) {
		const {comments, users}: {comments: CommentData[], users: UserData[]} = await fetch(
			GET_COMMENTS_URL + `?post=${props.post}` + (props.before ? `&before=${props.before}` : "")
		).then((e) => e.json());

		for (const userid in users) {
			User.from(this, users[userid]);
		}

		let createdComments = [];
		for (const comment of comments) {
			createdComments.push(Comment.from(this, comment));
		}

		return createdComments;
	}

	// @TODO add groupid
	@signedIn()
	async createPost(props: { content: string }) {
		const post = await fetch(CREATE_POST_URL, {
			method: "POST",
			body: JSON.stringify(props),
			headers: {
				"content-type": "application/json",
				Authorization: this.token!,
			},
		});
	}

	async getSelfInfo(token: string){
		const result = await fetch(GET_SELF_URL, {
			headers: {
				Authorization: token,
			},
		}).then((e) => e.json());
		if (result.error) {
			throw new Error(result.error);
		}
		return result;
	}

	async useToken(token: string) {
		const info = await this.getSelfInfo(token);
		this.clientUser = new ClientUser(this, info);
		this.token = token;
		this.emit("clientUserChanged");
	}

	/**
	 * Sign in with username and password
	 * Different then sign in because it is more uncommon so after calling this you need to use client.useToken(token)
	 */
	async signUp(username: string, password: string): Promise<string> {
		const result = await fetch(SIGN_UP_URL, {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				username,
				password,
			}),
		}).then((e) => e.json());
		if (result.error) {
			throw new Error(result.error);
		}
		return result.token;
	}

	@signedIn(true)
	signOut(){
		this.clientUser = undefined;
		this.token = undefined;
		this.emit("clientUserChanged");
	}

	@signedIn(true)
	async saveSettings(settings: Settings){
		// TODO
	}

	@signedIn(true)
	async getSettings(){

	}

	async getToken(username: string, password: string){
		const result = await fetch(SIGN_IN_URL, {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				username,
				password,
			}),
		}).then((e) => e.json());
		if (result.error) {
			throw new Error(result.error);
		}
		return result.token;
	}

	@signedIn(false)
	async signIn(username: string, password: string) {
		const token = await this.getToken(username, password);
		this.useToken(token);
	}

	constructor() {
		super();
		const socketio = io();
		socketio.on("post", ({ post, author }: { post: PostData; author: UserData }) => {
			User.from(this, author);

			// there is no need to call afterinit on post because there are no comments
			Post.from(this, post);
			this.emit("postAdded", post.id);
		});
		socketio.on("comment", ({comment, author}: { author: UserData, comment: CommentData})=>{
			User.from(this, author);
			const post = this.postsCache.get(comment.post)
			if (post) {
				Comment.from(this, comment);
				post.onNewComment(comment.id);
				this.emit("commentAdded", comment.id);
			}
		})
		socketio.on("postDeleted", (id) => {
			if (this.postsCache.has(id)) {
				this.emit("postDeleted", id);
				this.postsCache.get(id)!.emit("deleted");
				this.postsCache.delete(id);
			}
		});
		socketio.on("commentDeleted", (id) => {
			if (this.commentsCache.has(id)) {
				this.emit("commentDeleted", id);
				const comment = this.commentsCache.get(id)!;
				comment.emit("deleted");
				const loader = comment.post.commentsLoader;
				loader.loaded = loader.loaded.filter((e) => e !== id);
				loader.emit("update");
				this.commentsCache.delete(id);
			}
		})
	}
}
