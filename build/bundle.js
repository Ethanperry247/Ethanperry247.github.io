
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.24.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src\Components\About.svelte generated by Svelte v3.24.0 */

    const { window: window_1 } = globals;
    const file = "src\\Components\\About.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	return child_ctx;
    }

    // (21:16) {#each content.Content as paragraph}
    function create_each_block(ctx) {
    	let p;
    	let t_value = /*paragraph*/ ctx[8] + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			attr_dev(p, "class", "svelte-m5w1m");
    			add_location(p, file, 21, 20, 674);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && t_value !== (t_value = /*paragraph*/ ctx[8] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(21:16) {#each content.Content as paragraph}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let div5;
    	let div4;
    	let h1;
    	let t0;
    	let h1_class_value;
    	let t1;
    	let div3;
    	let div0;
    	let div0_class_value;
    	let t2;
    	let div1;
    	let div1_class_value;
    	let t3;
    	let div2;
    	let img;
    	let img_src_value;
    	let img_alt_value;
    	let div2_class_value;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[5]);
    	let each_value = /*content*/ ctx[0].Content;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			h1 = element("h1");
    			t0 = text(/*title*/ ctx[1]);
    			t1 = space();
    			div3 = element("div");
    			div0 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			div1 = element("div");
    			t3 = space();
    			div2 = element("div");
    			img = element("img");
    			attr_dev(h1, "class", h1_class_value = "" + (null_to_empty(/*animation*/ ctx[4] && "fade-in") + " svelte-m5w1m"));
    			add_location(h1, file, 17, 8, 458);
    			attr_dev(div0, "class", div0_class_value = "content " + (/*animation*/ ctx[4] && "fade-left") + " svelte-m5w1m");
    			add_location(div0, file, 19, 12, 550);
    			attr_dev(div1, "class", div1_class_value = "stylebar " + (/*animation*/ ctx[4] && "fade-in") + " svelte-m5w1m");
    			add_location(div1, file, 24, 12, 751);
    			if (img.src !== (img_src_value = "images/" + /*content*/ ctx[0].Image)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", img_alt_value = /*content*/ ctx[0].Image);
    			attr_dev(img, "class", "svelte-m5w1m");
    			add_location(img, file, 26, 16, 883);
    			attr_dev(div2, "class", div2_class_value = "image " + (/*animation*/ ctx[4] && "fade-right") + " svelte-m5w1m");
    			add_location(div2, file, 25, 12, 818);
    			attr_dev(div3, "class", "about svelte-m5w1m");
    			add_location(div3, file, 18, 8, 517);
    			add_location(div4, file, 16, 4, 443);
    			attr_dev(div5, "id", "About");
    			attr_dev(div5, "class", "center svelte-m5w1m");
    			add_location(div5, file, 15, 0, 384);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, h1);
    			append_dev(h1, t0);
    			append_dev(div4, t1);
    			append_dev(div4, div3);
    			append_dev(div3, div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			append_dev(div3, t2);
    			append_dev(div3, div1);
    			append_dev(div3, t3);
    			append_dev(div3, div2);
    			append_dev(div2, img);
    			/*div5_binding*/ ctx[6](div5);

    			if (!mounted) {
    				dispose = listen_dev(window_1, "scroll", () => {
    					scrolling = true;
    					clearTimeout(scrolling_timeout);
    					scrolling_timeout = setTimeout(clear_scrolling, 100);
    					/*onwindowscroll*/ ctx[5]();
    				});

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*scroll*/ 4 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1.pageXOffset, /*scroll*/ ctx[2]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			if (dirty & /*title*/ 2) set_data_dev(t0, /*title*/ ctx[1]);

    			if (dirty & /*animation*/ 16 && h1_class_value !== (h1_class_value = "" + (null_to_empty(/*animation*/ ctx[4] && "fade-in") + " svelte-m5w1m"))) {
    				attr_dev(h1, "class", h1_class_value);
    			}

    			if (dirty & /*content*/ 1) {
    				each_value = /*content*/ ctx[0].Content;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*animation*/ 16 && div0_class_value !== (div0_class_value = "content " + (/*animation*/ ctx[4] && "fade-left") + " svelte-m5w1m")) {
    				attr_dev(div0, "class", div0_class_value);
    			}

    			if (dirty & /*animation*/ 16 && div1_class_value !== (div1_class_value = "stylebar " + (/*animation*/ ctx[4] && "fade-in") + " svelte-m5w1m")) {
    				attr_dev(div1, "class", div1_class_value);
    			}

    			if (dirty & /*content*/ 1 && img.src !== (img_src_value = "images/" + /*content*/ ctx[0].Image)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (dirty & /*content*/ 1 && img_alt_value !== (img_alt_value = /*content*/ ctx[0].Image)) {
    				attr_dev(img, "alt", img_alt_value);
    			}

    			if (dirty & /*animation*/ 16 && div2_class_value !== (div2_class_value = "image " + (/*animation*/ ctx[4] && "fade-right") + " svelte-m5w1m")) {
    				attr_dev(div2, "class", div2_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			destroy_each(each_blocks, detaching);
    			/*div5_binding*/ ctx[6](null);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { content } = $$props;
    	let { title } = $$props;
    	let scroll;
    	let component;
    	let inView = false;
    	let animation = false;
    	const writable_props = ["content", "title"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<About> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("About", $$slots, []);

    	function onwindowscroll() {
    		$$invalidate(2, scroll = window_1.pageYOffset);
    	}

    	function div5_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			component = $$value;
    			$$invalidate(3, component);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    	};

    	$$self.$capture_state = () => ({
    		content,
    		title,
    		scroll,
    		component,
    		inView,
    		animation
    	});

    	$$self.$inject_state = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("scroll" in $$props) $$invalidate(2, scroll = $$props.scroll);
    		if ("component" in $$props) $$invalidate(3, component = $$props.component);
    		if ("inView" in $$props) $$invalidate(7, inView = $$props.inView);
    		if ("animation" in $$props) $$invalidate(4, animation = $$props.animation);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*scroll, component*/ 12) {
    			 $$invalidate(7, inView = scroll && component && component.getBoundingClientRect().top - window.innerHeight / 2 < 0);
    		}

    		if ($$self.$$.dirty & /*inView*/ 128) {
    			 if (inView) {
    				$$invalidate(4, animation = true);
    			}
    		}
    	};

    	return [content, title, scroll, component, animation, onwindowscroll, div5_binding];
    }

    class About extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { content: 0, title: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "About",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*content*/ ctx[0] === undefined && !("content" in props)) {
    			console.warn("<About> was created without expected prop 'content'");
    		}

    		if (/*title*/ ctx[1] === undefined && !("title" in props)) {
    			console.warn("<About> was created without expected prop 'title'");
    		}
    	}

    	get content() {
    		throw new Error("<About>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set content(value) {
    		throw new Error("<About>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<About>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<About>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Components\Education.svelte generated by Svelte v3.24.0 */

    const { window: window_1$1 } = globals;
    const file$1 = "src\\Components\\Education.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	return child_ctx;
    }

    // (26:16) {#each content.Content as item}
    function create_each_block$1(ctx) {
    	let li;
    	let strong;
    	let t0_value = /*item*/ ctx[8].split(":")[0] + "";
    	let t0;
    	let t1;
    	let t2_value = /*item*/ ctx[8].split(":")[1] + "";
    	let t2;

    	const block = {
    		c: function create() {
    			li = element("li");
    			strong = element("strong");
    			t0 = text(t0_value);
    			t1 = text(":");
    			t2 = text(t2_value);
    			add_location(strong, file$1, 26, 24, 987);
    			attr_dev(li, "class", "svelte-17cl4hu");
    			add_location(li, file$1, 26, 20, 983);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, strong);
    			append_dev(strong, t0);
    			append_dev(li, t1);
    			append_dev(li, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && t0_value !== (t0_value = /*item*/ ctx[8].split(":")[0] + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*content*/ 1 && t2_value !== (t2_value = /*item*/ ctx[8].split(":")[1] + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(26:16) {#each content.Content as item}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let div3;
    	let div2;
    	let h1;
    	let t0;
    	let h1_class_value;
    	let t1;
    	let div0;
    	let img;
    	let img_src_value;
    	let img_alt_value;
    	let div0_class_value;
    	let t2;
    	let div1;
    	let h2;
    	let strong;
    	let t3_value = /*content*/ ctx[0].Title + "";
    	let t3;
    	let t4;
    	let t5_value = /*content*/ ctx[0].Subtitle + "";
    	let t5;
    	let t6;
    	let h3;
    	let t7_value = /*content*/ ctx[0].Position + "";
    	let t7;
    	let t8;
    	let ul;
    	let div1_class_value;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[5]);
    	let each_value = /*content*/ ctx[0].Content;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div2 = element("div");
    			h1 = element("h1");
    			t0 = text(/*title*/ ctx[1]);
    			t1 = space();
    			div0 = element("div");
    			img = element("img");
    			t2 = space();
    			div1 = element("div");
    			h2 = element("h2");
    			strong = element("strong");
    			t3 = text(t3_value);
    			t4 = text(" | ");
    			t5 = text(t5_value);
    			t6 = space();
    			h3 = element("h3");
    			t7 = text(t7_value);
    			t8 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(h1, "class", h1_class_value = "" + (null_to_empty(/*animation*/ ctx[4] ? "fade-in" : "") + " svelte-17cl4hu"));
    			add_location(h1, file$1, 17, 8, 480);
    			if (img.src !== (img_src_value = "images/" + /*content*/ ctx[0].Image)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", img_alt_value = /*content*/ ctx[0].title);
    			add_location(img, file$1, 19, 12, 634);
    			attr_dev(div0, "class", div0_class_value = "shadow image image-container " + (/*animation*/ ctx[4] ? "roll-and-fade" : "") + " svelte-17cl4hu");
    			add_location(div0, file$1, 18, 8, 543);
    			add_location(strong, file$1, 22, 16, 795);
    			attr_dev(h2, "class", "svelte-17cl4hu");
    			add_location(h2, file$1, 22, 12, 791);
    			attr_dev(h3, "class", "svelte-17cl4hu");
    			add_location(h3, file$1, 23, 12, 867);
    			attr_dev(ul, "class", "svelte-17cl4hu");
    			add_location(ul, file$1, 24, 12, 908);
    			attr_dev(div1, "class", div1_class_value = "shadow content " + (/*animation*/ ctx[4] ? "fade-right" : "") + " svelte-17cl4hu");
    			add_location(div1, file$1, 21, 8, 717);
    			attr_dev(div2, "id", "Education");
    			attr_dev(div2, "class", "spotlight svelte-17cl4hu");
    			add_location(div2, file$1, 16, 4, 432);
    			attr_dev(div3, "class", "center");
    			add_location(div3, file$1, 15, 0, 384);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div2);
    			append_dev(div2, h1);
    			append_dev(h1, t0);
    			append_dev(div2, t1);
    			append_dev(div2, div0);
    			append_dev(div0, img);
    			append_dev(div2, t2);
    			append_dev(div2, div1);
    			append_dev(div1, h2);
    			append_dev(h2, strong);
    			append_dev(strong, t3);
    			append_dev(h2, t4);
    			append_dev(h2, t5);
    			append_dev(div1, t6);
    			append_dev(div1, h3);
    			append_dev(h3, t7);
    			append_dev(div1, t8);
    			append_dev(div1, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			/*div3_binding*/ ctx[6](div3);

    			if (!mounted) {
    				dispose = listen_dev(window_1$1, "scroll", () => {
    					scrolling = true;
    					clearTimeout(scrolling_timeout);
    					scrolling_timeout = setTimeout(clear_scrolling, 100);
    					/*onwindowscroll*/ ctx[5]();
    				});

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*scroll*/ 8 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1$1.pageXOffset, /*scroll*/ ctx[3]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			if (dirty & /*title*/ 2) set_data_dev(t0, /*title*/ ctx[1]);

    			if (dirty & /*animation*/ 16 && h1_class_value !== (h1_class_value = "" + (null_to_empty(/*animation*/ ctx[4] ? "fade-in" : "") + " svelte-17cl4hu"))) {
    				attr_dev(h1, "class", h1_class_value);
    			}

    			if (dirty & /*content*/ 1 && img.src !== (img_src_value = "images/" + /*content*/ ctx[0].Image)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (dirty & /*content*/ 1 && img_alt_value !== (img_alt_value = /*content*/ ctx[0].title)) {
    				attr_dev(img, "alt", img_alt_value);
    			}

    			if (dirty & /*animation*/ 16 && div0_class_value !== (div0_class_value = "shadow image image-container " + (/*animation*/ ctx[4] ? "roll-and-fade" : "") + " svelte-17cl4hu")) {
    				attr_dev(div0, "class", div0_class_value);
    			}

    			if (dirty & /*content*/ 1 && t3_value !== (t3_value = /*content*/ ctx[0].Title + "")) set_data_dev(t3, t3_value);
    			if (dirty & /*content*/ 1 && t5_value !== (t5_value = /*content*/ ctx[0].Subtitle + "")) set_data_dev(t5, t5_value);
    			if (dirty & /*content*/ 1 && t7_value !== (t7_value = /*content*/ ctx[0].Position + "")) set_data_dev(t7, t7_value);

    			if (dirty & /*content*/ 1) {
    				each_value = /*content*/ ctx[0].Content;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*animation*/ 16 && div1_class_value !== (div1_class_value = "shadow content " + (/*animation*/ ctx[4] ? "fade-right" : "") + " svelte-17cl4hu")) {
    				attr_dev(div1, "class", div1_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			destroy_each(each_blocks, detaching);
    			/*div3_binding*/ ctx[6](null);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { content } = $$props;
    	let { title } = $$props;
    	let component;
    	let scroll;
    	let inView = false;
    	let animation = false;
    	const writable_props = ["content", "title"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Education> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Education", $$slots, []);

    	function onwindowscroll() {
    		$$invalidate(3, scroll = window_1$1.pageYOffset);
    	}

    	function div3_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			component = $$value;
    			$$invalidate(2, component);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    	};

    	$$self.$capture_state = () => ({
    		content,
    		title,
    		component,
    		scroll,
    		inView,
    		animation
    	});

    	$$self.$inject_state = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("component" in $$props) $$invalidate(2, component = $$props.component);
    		if ("scroll" in $$props) $$invalidate(3, scroll = $$props.scroll);
    		if ("inView" in $$props) $$invalidate(7, inView = $$props.inView);
    		if ("animation" in $$props) $$invalidate(4, animation = $$props.animation);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*scroll, component*/ 12) {
    			 $$invalidate(7, inView = scroll && component && component.getBoundingClientRect().top - window.innerHeight / 2 < 0);
    		}

    		if ($$self.$$.dirty & /*inView*/ 128) {
    			 if (inView) {
    				$$invalidate(4, animation = true);
    			}
    		}
    	};

    	return [content, title, component, scroll, animation, onwindowscroll, div3_binding];
    }

    class Education extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { content: 0, title: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Education",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*content*/ ctx[0] === undefined && !("content" in props)) {
    			console.warn("<Education> was created without expected prop 'content'");
    		}

    		if (/*title*/ ctx[1] === undefined && !("title" in props)) {
    			console.warn("<Education> was created without expected prop 'title'");
    		}
    	}

    	get content() {
    		throw new Error("<Education>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set content(value) {
    		throw new Error("<Education>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<Education>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Education>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }

    const Images = [
        "Airplane.png",
        "Alpine.png",
        "Covidtool.svg",
        "Ethan.jpg",
        "EthanPerry.jpg",
        "Github.png",
        "HCI.png",
        "Imd.svg",
        "Linkedin.png",
        "Lockheed.png",
        "Microsoft.png",
        "Mines.png",
        "Pecs.jpg",
        "Q2.svg",
        "Website.svg"
    ];

    const MainBanner = {
        title: "Ethan Perry",
        details: [
            "Undergrad — Colorado School of Mines.",
            "Research Intern — Microsoft Quantum."
        ],
        image: "EthanPerry.jpg",
    };

    const NavItems = [
        "About",
        "Education",
        "Experience",
        "Research",
        "Projects",
        "Contact"
    ];

    const AboutTitle = "About Me";

    const About$1 = {
        Content: [
            `Hello, and welcome to my website! My name is Ethan Perry, and I am a computer science undergrad from Colorado School 
        of Mines. Curious, driven, and passionate are three words which describe me best.`,
            `In my free time, I love to hike, bicycle, go camping, go backpacking, or do just about anything else outdoors. 
        I am an active member of the Club Triathlon Team at Mines and do several triathlons across the country with the team 
        each semester. In addition, I love playing and listening to music—I try to play or compose whenever I can.`,
            `Of course, I am all things computer science—not only coding, but learning and investigating new technologies, 
        research, and projects that are continually bombarding the public.`,
        ],
        Image: "Ethan.jpg",
    };

    const EducationTitle = "Education";

    const Education$1 = {
        Section: "Education",
        Title: "Colorado School of Mines",
        Subtitle: "Anticipated Graduation - 2023",
        Position: "B.S. Computer Science",
        Content: [
            "GPA: 4.0/4.0",
            "Applicable Coursework: Data structures, Linux OS, Discrete Math, Software Engineering, Computer Organization, Database Management.",
            "Indepedent Studies: Interactive Media Display, Motion Tracking Cameras for HCI, IOT Systems for Smart Buildings, Ethics of Computer Consciousness.",
            "TA Positions: Intro to Computer Science (CSCI 101), Data Structures (CSCI 262), Database Management (CSCI 403).",
            "Activities: Association of Computational Machinery, Linux Users Group, Club triathlon, Residence Life Ambassadors, Orchestra, Marching Band.",
            "Leadership: Secretary of Club Triathlon, UCLIMB Mentor (Undergrad CS Mentor)."
        ],
        Image: "Mines.png"
    };

    const ExperienceTitle = "Experience";

    const Resume = [{
        Title: "Microsoft Quantum",
        Subtitle: "Summer 2020",
        Position: "Research Intern - Programming",
        Content: [
            "Developed a variety of new and experimental features for the front-end of the Microsoft Azure Quantum Portal.",
            "Constructed engaging data visualizations and tool sets to enhance customer experience.",
            "Cultivated a generous set of skills with front-end development, user interfaces, and user experience.",
            "Had the opporunity to design, implement, and release my own ideas.",
            "Made real business impact for Microsoft by releasing several new features to production."
        ],
        Tags: [
            "TypeScript",
            "KnockoutJS",
            ".Net",
            "Agile"
        ],
        Image: "Microsoft.png"
    },
    {
        Title: "Lockheed Martin",
        Subtitle: "July 2019 - May 2020",
        Position: "Software Engineering Intern",
        Content: [
            "Developed internal software and tools, ranging from web-based applications to integrated development.",
            "Helped interview and hire five new interns.",
            "Learned C# and Unity to develop VR simulations to enhance customer experience."
        ],
        Tags: [
            "Angular 8",
            "Raspberry Pi",
            "Unity",
            "C#"
        ],
        Image: "Lockheed.png"
    },
    {
        Title: "Alpine Coffee Co",
        Subtitle: "December 2014 - May 2020",
        Position: "Software and Web Developer",
        Content: [
            "Managed the main company server and email services.",
            "Overhauled the company website, adding a retail store and enhancing SEO.",
            "Deployed several custom IOT and automation solutions, speeding up manufacturing and packaging of coffee.",
        ],
        Tags: [
            "Raspberry Pi",
            "Arduino",
            "Python",
            "Flask"
        ],
        Image: "Alpine.png"
    }];

    const ReseachTitle = "Research";

    const Research = [{
        Title: "The Influence of Social Embarrassment on Engagement with Publicly Displayed Digital Content",
        Subtitle: "Accepted June 2020",
        Position: "Co-First Author",
        Content: [
            "Accepted for publishment in Springer CCIS Proceedings.",
            "Work is focused on an experiment for exploring the effetiveness of different content-sensitive solicitation strategies with public digital signage."
        ],
        Tags: [
            "HCI",
            "Computer Vision",
            "VueJS",
            "Flask"
        ],
        Image: "HCI.png"
    },{
            Title: "Relay Node Placement for IOT Networks with Imperfect Communication Ranges",
            Subtitle: "January 2020 - Current",
            Position: "Chief Investigator",
            Content: [
                "Focused on development of a novel relay node placement algorithm for practical settings.",
                "Funded by the Pervasive Computing Systems group (PeCS)."
            ],
            Tags: [
                "Arduino",
                "Raspberry Pi",
                "Wireless Mesh Networks",
                "NRF Radios"
            ],
            Image: "Pecs.jpg"
    },{
        Title: "Quality-aware Audio Multicast in Low Power Wireless Network",
        Subtitle: "August 2019 - January 2020",
        Position: "Associate Investigator",
        Content: [
            "An NSF funded project devoted to the application of low power, low bandwidth devices to emergency situations.",
            "My role focused on swarming robotics to test a novel multicast routing protocol.",
            "Preliminary work published in Reuleaux, the Mines undergraduate research journal."
        ],
        Tags: [
            "Swarming Robotics",
            "Wireless Mesh Networks",
            "Zigbee Radios"
        ],
        Image: "Pecs.jpg"
    }];

    const ProjectsTitle = "Notable Projects";

    const Projects = [{
        Title: "Welcome to Mines!",
        Content: [
            "An interactive web application built for campus and community members around School of Mines.",
            "Funded by a 2018 Mines technology grant, the application runs on two 65\" touch screen displays: one in the student center, and the other in the main academic building on campus.",
            "The web application features a campus map, where users may search for academic buildings, resturants, and other amenities around campus.",
            "Additionally, the app contains an interactive 'self-care' wheel and series of info-tabs on food security as an on-campus initiative to promote mental-health.",
            "Lastly, a depth sensing camera and separate motion sensing camera give interactive features to the display through a subsidiary Python server."
        ],
        Image: "Imd.svg",
        Tags: [
            "VueJS",
            "NodeJS",
            "ExpressJS",
            "Computer Vision",
            "HCI"
        ],
    },{
        Title: "This Website",
        Content: [
            "After having recently discovered a new web-framework called Svelte, I was highly interested in giving it a try on a bigger project.",
            "I redesigned this online portfolio in the framework, and have begun using it for most new projects since.",
            "Some of my favorite features are its template syntax and its transition/animation support."
        ],
        Image: "Website.svg",
        Tags: [
            "Svelte",
            "CSS Animations",
        ],
    },{
        Title: "Q2: Quality Control v2",
        Content: [
            "A custom IOT and automation solution built for Alpine Coffee Co. The machine counts packaged coffee while it comes off of the conveyor, individually packing a custom number of cups in each box.",
            "There is also built in functionality for viewing each package with a camera and checking for consistancy.",
            "The whole mechanism, conyevor, sensors, and other functionality of the machine can be controlled and viewed from a web application hosted on-board. It will also track and display custom metrics as coffee is measured and boxed.",
        ],
        Image: "Q2.svg",
        Tags: [
            "Flask",
            "Python",
            "IOT",
            "C++ & Embedded C",
            "AJAX"
        ],
    },{
        Title: "Covid Search Tool",
        Content: [
            "A flask web application designed as an SQL project.",
            "Database allows for bulk loading huge datasets which may all be retrieved through an easy and user friendly UI.",
            "Support for country wide, state wide, and county wide graphs reporting cases and other metrics.",
        ],
        Image: "Covidtool.svg",
        Tags: [
            "PSQL",
            "Flask",
            "Bulk Loading",
        ],
    }];

    const Contact = [{
        Image: "Linkedin.png",
        Text: "linkedin.com/in/ethanlperry/",
        Link: "https://www.linkedin.com/in/ethanlperry/"
    },{
        Image: "Airplane.png",
        Text: "Eperry1@mymail.mines.edu",
        Link: "Mailto: Eperry1@mymail.mines.edu"
    },{
        Image: "Github.png",
        Text: "Ethanperry247",
        Link: "https://github.com/Ethanperry247"
    }];

    const Footer = "Copywright 2020 - Ethan Perry";

    var content = /*#__PURE__*/Object.freeze({
        __proto__: null,
        Images: Images,
        MainBanner: MainBanner,
        NavItems: NavItems,
        AboutTitle: AboutTitle,
        About: About$1,
        EducationTitle: EducationTitle,
        Education: Education$1,
        ExperienceTitle: ExperienceTitle,
        Resume: Resume,
        ReseachTitle: ReseachTitle,
        Research: Research,
        ProjectsTitle: ProjectsTitle,
        Projects: Projects,
        Contact: Contact,
        Footer: Footer
    });

    /* src\Components\Logo.svelte generated by Svelte v3.24.0 */

    const file$2 = "src\\Components\\Logo.svelte";

    function create_fragment$2(ctx) {
    	let a;
    	let div2;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let p;

    	const block = {
    		c: function create() {
    			a = element("a");
    			div2 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			t1 = space();
    			p = element("p");
    			p.textContent = "E";
    			attr_dev(div0, "class", "anim1 svelte-isc63d");
    			add_location(div0, file$2, 2, 8, 71);
    			attr_dev(div1, "class", "anim2 svelte-isc63d");
    			add_location(div1, file$2, 3, 8, 106);
    			attr_dev(p, "class", "logo svelte-isc63d");
    			add_location(p, file$2, 4, 8, 141);
    			attr_dev(div2, "class", "logo svelte-isc63d");
    			add_location(div2, file$2, 1, 4, 43);
    			attr_dev(a, "href", "resume.pdf");
    			attr_dev(a, "target", "_blank");
    			add_location(a, file$2, 0, 0, 0);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, div2);
    			append_dev(div2, div0);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			append_dev(div2, t1);
    			append_dev(div2, p);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props) {
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Logo> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Logo", $$slots, []);
    	return [];
    }

    class Logo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Logo",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src\Components\Nav.svelte generated by Svelte v3.24.0 */

    const { window: window_1$2 } = globals;
    const file$3 = "src\\Components\\Nav.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	return child_ctx;
    }

    // (41:8) {#if scroll > 0}
    function create_if_block(ctx) {
    	let li;
    	let li_transition;
    	let current;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			li = element("li");
    			li.textContent = `${scrollToTopMessage}`;
    			attr_dev(li, "class", "svelte-1wfth1k");
    			add_location(li, file$3, 41, 12, 1166);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(li, "click", /*scrollToTop*/ ctx[3], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!li_transition) li_transition = create_bidirectional_transition(li, fade, { duration: 200 }, true);
    				li_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!li_transition) li_transition = create_bidirectional_transition(li, fade, { duration: 200 }, false);
    			li_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (detaching && li_transition) li_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(41:8) {#if scroll > 0}",
    		ctx
    	});

    	return block;
    }

    // (44:8) {#each content as item}
    function create_each_block$2(ctx) {
    	let li;
    	let t_value = /*item*/ ctx[8] + "";
    	let t;
    	let mounted;
    	let dispose;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[7](/*item*/ ctx[8], ...args);
    	}

    	const block = {
    		c: function create() {
    			li = element("li");
    			t = text(t_value);
    			attr_dev(li, "class", "svelte-1wfth1k");
    			add_location(li, file$3, 44, 12, 1314);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t);

    			if (!mounted) {
    				dispose = listen_dev(li, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*content*/ 1 && t_value !== (t_value = /*item*/ ctx[8] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(44:8) {#each content as item}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let div1;
    	let div0;
    	let t0;
    	let ul0;
    	let logo;
    	let t1;
    	let ul1;
    	let li0;
    	let t3;
    	let t4;
    	let t5;
    	let a;
    	let li1;
    	let div1_class_value;
    	let current;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[6]);
    	logo = new Logo({ $$inline: true });
    	let if_block = /*scroll*/ ctx[1] > 0 && create_if_block(ctx);
    	let each_value = /*content*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			t0 = space();
    			ul0 = element("ul");
    			create_component(logo.$$.fragment);
    			t1 = space();
    			ul1 = element("ul");
    			li0 = element("li");
    			li0.textContent = "Menu";
    			t3 = space();
    			if (if_block) if_block.c();
    			t4 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t5 = space();
    			a = element("a");
    			li1 = element("li");
    			li1.textContent = "Resume";
    			attr_dev(div0, "class", "stylebar svelte-1wfth1k");
    			add_location(div0, file$3, 34, 4, 975);
    			attr_dev(ul0, "class", "svelte-1wfth1k");
    			add_location(ul0, file$3, 35, 4, 1009);
    			attr_dev(li0, "class", "icon svelte-1wfth1k");
    			add_location(li0, file$3, 39, 8, 1067);
    			attr_dev(li1, "class", "svelte-1wfth1k");
    			add_location(li1, file$3, 47, 12, 1445);
    			attr_dev(a, "href", "resume.pdf");
    			attr_dev(a, "target", "_blank");
    			attr_dev(a, "class", "svelte-1wfth1k");
    			add_location(a, file$3, 46, 8, 1394);
    			attr_dev(ul1, "class", "svelte-1wfth1k");
    			add_location(ul1, file$3, 38, 4, 1053);

    			set_style(div1, "--nav-items", /*mobileMenu*/ ctx[2]
    			? /*scroll*/ ctx[1] > 0
    				? /*content*/ ctx[0].length + 3
    				: /*content*/ ctx[0].length + 2
    			: 1);

    			attr_dev(div1, "class", div1_class_value = "nav " + (/*scroll*/ ctx[1] > 0 ? "shadow" : "") + " " + (/*mobileMenu*/ ctx[2] ? "responsive" : "") + " svelte-1wfth1k");
    			add_location(div1, file$3, 32, 0, 791);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div1, t0);
    			append_dev(div1, ul0);
    			mount_component(logo, ul0, null);
    			append_dev(div1, t1);
    			append_dev(div1, ul1);
    			append_dev(ul1, li0);
    			append_dev(ul1, t3);
    			if (if_block) if_block.m(ul1, null);
    			append_dev(ul1, t4);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul1, null);
    			}

    			append_dev(ul1, t5);
    			append_dev(ul1, a);
    			append_dev(a, li1);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(window_1$2, "scroll", () => {
    						scrolling = true;
    						clearTimeout(scrolling_timeout);
    						scrolling_timeout = setTimeout(clear_scrolling, 100);
    						/*onwindowscroll*/ ctx[6]();
    					}),
    					listen_dev(li0, "click", /*handleMobileMenuClick*/ ctx[5], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*scroll*/ 2 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1$2.pageXOffset, /*scroll*/ ctx[1]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			if (/*scroll*/ ctx[1] > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*scroll*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(ul1, t4);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (dirty & /*handleNavClick, content*/ 17) {
    				each_value = /*content*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul1, t5);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (!current || dirty & /*mobileMenu, scroll, content*/ 7) {
    				set_style(div1, "--nav-items", /*mobileMenu*/ ctx[2]
    				? /*scroll*/ ctx[1] > 0
    					? /*content*/ ctx[0].length + 3
    					: /*content*/ ctx[0].length + 2
    				: 1);
    			}

    			if (!current || dirty & /*scroll, mobileMenu*/ 6 && div1_class_value !== (div1_class_value = "nav " + (/*scroll*/ ctx[1] > 0 ? "shadow" : "") + " " + (/*mobileMenu*/ ctx[2] ? "responsive" : "") + " svelte-1wfth1k")) {
    				attr_dev(div1, "class", div1_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(logo.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(logo.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(logo);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const scrollToTopMessage = "Back to Top";

    function instance$3($$self, $$props, $$invalidate) {
    	let { content } = $$props;
    	let scroll = 0;
    	let mobileMenu = false;

    	const scrollToTop = () => {
    		window.scroll(0, 0);

    		if (mobileMenu) {
    			$$invalidate(2, mobileMenu = !mobileMenu);
    		}
    	};

    	const handleNavClick = item => {
    		document.getElementById(item).scrollIntoView();

    		if (mobileMenu) {
    			$$invalidate(2, mobileMenu = !mobileMenu);
    		}
    	};

    	// Toggles the mobile menu.
    	const handleMobileMenuClick = () => {
    		$$invalidate(2, mobileMenu = !mobileMenu);
    	};

    	const writable_props = ["content"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Nav> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Nav", $$slots, []);

    	function onwindowscroll() {
    		$$invalidate(1, scroll = window_1$2.pageYOffset);
    	}

    	const click_handler = item => handleNavClick(item);

    	$$self.$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    	};

    	$$self.$capture_state = () => ({
    		fade,
    		NavItems,
    		Logo,
    		content,
    		scrollToTopMessage,
    		scroll,
    		mobileMenu,
    		scrollToTop,
    		handleNavClick,
    		handleMobileMenuClick
    	});

    	$$self.$inject_state = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("scroll" in $$props) $$invalidate(1, scroll = $$props.scroll);
    		if ("mobileMenu" in $$props) $$invalidate(2, mobileMenu = $$props.mobileMenu);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		content,
    		scroll,
    		mobileMenu,
    		scrollToTop,
    		handleNavClick,
    		handleMobileMenuClick,
    		onwindowscroll,
    		click_handler
    	];
    }

    class Nav extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { content: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Nav",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*content*/ ctx[0] === undefined && !("content" in props)) {
    			console.warn("<Nav> was created without expected prop 'content'");
    		}
    	}

    	get content() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set content(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Components\Banner.svelte generated by Svelte v3.24.0 */

    const file$4 = "src\\Components\\Banner.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (12:4) {#if content.image}
    function create_if_block_3(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			attr_dev(img, "class", "shadow svelte-vnrzl6");
    			if (img.src !== (img_src_value = "images/" + /*content*/ ctx[0].image)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Author");
    			add_location(img, file$4, 12, 8, 320);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && img.src !== (img_src_value = "images/" + /*content*/ ctx[0].image)) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(12:4) {#if content.image}",
    		ctx
    	});

    	return block;
    }

    // (15:4) {#if content.title}
    function create_if_block_2(ctx) {
    	let h1;
    	let t_value = /*content*/ ctx[0].title + "";
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(t_value);
    			attr_dev(h1, "class", "svelte-vnrzl6");
    			add_location(h1, file$4, 15, 8, 429);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && t_value !== (t_value = /*content*/ ctx[0].title + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(15:4) {#if content.title}",
    		ctx
    	});

    	return block;
    }

    // (18:4) {#if content.details}
    function create_if_block_1(ctx) {
    	let each_1_anchor;
    	let each_value = /*content*/ ctx[0].details;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1) {
    				each_value = /*content*/ ctx[0].details;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(18:4) {#if content.details}",
    		ctx
    	});

    	return block;
    }

    // (19:8) {#each content.details as detail}
    function create_each_block$3(ctx) {
    	let p;
    	let t_value = /*detail*/ ctx[4] + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			attr_dev(p, "class", "svelte-vnrzl6");
    			add_location(p, file$4, 19, 12, 548);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && t_value !== (t_value = /*detail*/ ctx[4] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(19:8) {#each content.details as detail}",
    		ctx
    	});

    	return block;
    }

    // (23:4) {#if content.title}
    function create_if_block$1(ctx) {
    	let h1;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "▼";
    			attr_dev(h1, "class", "arrow svelte-vnrzl6");
    			add_location(h1, file$4, 23, 8, 626);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);

    			if (!mounted) {
    				dispose = listen_dev(h1, "click", /*handleClick*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(23:4) {#if content.title}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let if_block0 = /*content*/ ctx[0].image && create_if_block_3(ctx);
    	let if_block1 = /*content*/ ctx[0].title && create_if_block_2(ctx);
    	let if_block2 = /*content*/ ctx[0].details && create_if_block_1(ctx);
    	let if_block3 = /*content*/ ctx[0].title && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			if (if_block3) if_block3.c();
    			set_style(div, "height", /*height*/ ctx[1] / 2 + "px");
    			set_style(div, "padding", /*height*/ ctx[1] / 3 + "px 0");
    			attr_dev(div, "class", "banner svelte-vnrzl6");
    			add_location(div, file$4, 10, 0, 206);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append_dev(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append_dev(div, t1);
    			if (if_block2) if_block2.m(div, null);
    			append_dev(div, t2);
    			if (if_block3) if_block3.m(div, null);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*content*/ ctx[0].image) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*content*/ ctx[0].title) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*content*/ ctx[0].details) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_1(ctx);
    					if_block2.c();
    					if_block2.m(div, t2);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (/*content*/ ctx[0].title) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block$1(ctx);
    					if_block3.c();
    					if_block3.m(div, null);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (dirty & /*height*/ 2) {
    				set_style(div, "height", /*height*/ ctx[1] / 2 + "px");
    			}

    			if (dirty & /*height*/ 2) {
    				set_style(div, "padding", /*height*/ ctx[1] / 3 + "px 0");
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { content } = $$props;
    	let { height } = $$props;
    	let { scrollItem } = $$props;

    	const handleClick = () => {
    		document.getElementById(scrollItem).scrollIntoView();
    	};

    	const writable_props = ["content", "height", "scrollItem"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Banner> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Banner", $$slots, []);

    	$$self.$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("height" in $$props) $$invalidate(1, height = $$props.height);
    		if ("scrollItem" in $$props) $$invalidate(3, scrollItem = $$props.scrollItem);
    	};

    	$$self.$capture_state = () => ({ content, height, scrollItem, handleClick });

    	$$self.$inject_state = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("height" in $$props) $$invalidate(1, height = $$props.height);
    		if ("scrollItem" in $$props) $$invalidate(3, scrollItem = $$props.scrollItem);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [content, height, handleClick, scrollItem];
    }

    class Banner extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { content: 0, height: 1, scrollItem: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Banner",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*content*/ ctx[0] === undefined && !("content" in props)) {
    			console.warn("<Banner> was created without expected prop 'content'");
    		}

    		if (/*height*/ ctx[1] === undefined && !("height" in props)) {
    			console.warn("<Banner> was created without expected prop 'height'");
    		}

    		if (/*scrollItem*/ ctx[3] === undefined && !("scrollItem" in props)) {
    			console.warn("<Banner> was created without expected prop 'scrollItem'");
    		}
    	}

    	get content() {
    		throw new Error("<Banner>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set content(value) {
    		throw new Error("<Banner>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get height() {
    		throw new Error("<Banner>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set height(value) {
    		throw new Error("<Banner>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scrollItem() {
    		throw new Error("<Banner>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scrollItem(value) {
    		throw new Error("<Banner>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Components\Resume.svelte generated by Svelte v3.24.0 */

    const { window: window_1$3 } = globals;
    const file$5 = "src\\Components\\Resume.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[12] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	return child_ctx;
    }

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i];
    	child_ctx[11] = i;
    	return child_ctx;
    }

    // (30:24) {#each section.Content as item}
    function create_each_block_2(ctx) {
    	let li;
    	let t_value = /*item*/ ctx[15] + "";
    	let t;

    	const block = {
    		c: function create() {
    			li = element("li");
    			t = text(t_value);
    			attr_dev(li, "class", "svelte-t5hwxm");
    			add_location(li, file$5, 30, 28, 1179);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && t_value !== (t_value = /*item*/ ctx[15] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(30:24) {#each section.Content as item}",
    		ctx
    	});

    	return block;
    }

    // (35:24) {#each section.Tags as tag}
    function create_each_block_1(ctx) {
    	let p;
    	let t_value = /*tag*/ ctx[12] + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			add_location(p, file$5, 35, 28, 1377);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && t_value !== (t_value = /*tag*/ ctx[12] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(35:24) {#each section.Tags as tag}",
    		ctx
    	});

    	return block;
    }

    // (20:8) {#each content as section, index}
    function create_each_block$4(ctx) {
    	let div3;
    	let div0;
    	let img;
    	let img_src_value;
    	let img_alt_value;
    	let t0;
    	let div2;
    	let h2;
    	let strong;
    	let t1_value = /*section*/ ctx[9].Title + "";
    	let t1;
    	let t2;
    	let t3_value = /*section*/ ctx[9].Subtitle + "";
    	let t3;
    	let t4;
    	let h3;
    	let t5_value = /*section*/ ctx[9].Position + "";
    	let t5;
    	let t6;
    	let ul;
    	let t7;
    	let div1;
    	let t8;
    	let div3_class_value;
    	let each_value_2 = /*section*/ ctx[9].Content;
    	validate_each_argument(each_value_2);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_1[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*section*/ ctx[9].Tags;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div0 = element("div");
    			img = element("img");
    			t0 = space();
    			div2 = element("div");
    			h2 = element("h2");
    			strong = element("strong");
    			t1 = text(t1_value);
    			t2 = text(" | ");
    			t3 = text(t3_value);
    			t4 = space();
    			h3 = element("h3");
    			t5 = text(t5_value);
    			t6 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t7 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t8 = space();
    			if (img.src !== (img_src_value = "images/" + /*section*/ ctx[9].Image)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", img_alt_value = /*section*/ ctx[9].Image);
    			add_location(img, file$5, 23, 20, 813);
    			attr_dev(div0, "class", "shadow image-container");
    			add_location(div0, file$5, 22, 16, 755);
    			add_location(strong, file$5, 26, 24, 959);
    			attr_dev(h2, "class", "svelte-t5hwxm");
    			add_location(h2, file$5, 26, 20, 955);
    			attr_dev(h3, "class", "svelte-t5hwxm");
    			add_location(h3, file$5, 27, 20, 1039);
    			attr_dev(ul, "class", "svelte-t5hwxm");
    			add_location(ul, file$5, 28, 20, 1088);
    			attr_dev(div1, "class", "tags");
    			add_location(div1, file$5, 33, 20, 1276);
    			attr_dev(div2, "class", "content svelte-t5hwxm");
    			add_location(div2, file$5, 25, 16, 912);
    			set_style(div3, "--delay", 0.25 * (/*index*/ ctx[11] + 1) + "s");
    			attr_dev(div3, "class", div3_class_value = "shadow resume " + (/*animation*/ ctx[5] ? "fade-in" : "") + " svelte-t5hwxm");
    			add_location(div3, file$5, 20, 12, 628);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div0);
    			append_dev(div0, img);
    			append_dev(div3, t0);
    			append_dev(div3, div2);
    			append_dev(div2, h2);
    			append_dev(h2, strong);
    			append_dev(strong, t1);
    			append_dev(h2, t2);
    			append_dev(h2, t3);
    			append_dev(div2, t4);
    			append_dev(div2, h3);
    			append_dev(h3, t5);
    			append_dev(div2, t6);
    			append_dev(div2, ul);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(ul, null);
    			}

    			append_dev(div2, t7);
    			append_dev(div2, div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			append_dev(div3, t8);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && img.src !== (img_src_value = "images/" + /*section*/ ctx[9].Image)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (dirty & /*content*/ 1 && img_alt_value !== (img_alt_value = /*section*/ ctx[9].Image)) {
    				attr_dev(img, "alt", img_alt_value);
    			}

    			if (dirty & /*content*/ 1 && t1_value !== (t1_value = /*section*/ ctx[9].Title + "")) set_data_dev(t1, t1_value);
    			if (dirty & /*content*/ 1 && t3_value !== (t3_value = /*section*/ ctx[9].Subtitle + "")) set_data_dev(t3, t3_value);
    			if (dirty & /*content*/ 1 && t5_value !== (t5_value = /*section*/ ctx[9].Position + "")) set_data_dev(t5, t5_value);

    			if (dirty & /*content*/ 1) {
    				each_value_2 = /*section*/ ctx[9].Content;
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_2(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_2.length;
    			}

    			if (dirty & /*content*/ 1) {
    				each_value_1 = /*section*/ ctx[9].Tags;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty & /*animation*/ 32 && div3_class_value !== (div3_class_value = "shadow resume " + (/*animation*/ ctx[5] ? "fade-in" : "") + " svelte-t5hwxm")) {
    				attr_dev(div3, "class", div3_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$4.name,
    		type: "each",
    		source: "(20:8) {#each content as section, index}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let div1;
    	let div0;
    	let h1;
    	let t0;
    	let h1_class_value;
    	let t1;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[6]);
    	let each_value = /*content*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			t0 = text(/*title*/ ctx[1]);
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			set_style(h1, "--delay", "0.25s");
    			attr_dev(h1, "class", h1_class_value = "" + (null_to_empty(/*animation*/ ctx[5] ? "fade-in" : "") + " svelte-t5hwxm"));
    			add_location(h1, file$5, 18, 8, 495);
    			attr_dev(div0, "id", /*id*/ ctx[2]);
    			attr_dev(div0, "class", "container svelte-t5hwxm");
    			add_location(div0, file$5, 17, 4, 452);
    			attr_dev(div1, "class", "center");
    			add_location(div1, file$5, 16, 0, 404);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, h1);
    			append_dev(h1, t0);
    			append_dev(div0, t1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			/*div1_binding*/ ctx[7](div1);

    			if (!mounted) {
    				dispose = listen_dev(window_1$3, "scroll", () => {
    					scrolling = true;
    					clearTimeout(scrolling_timeout);
    					scrolling_timeout = setTimeout(clear_scrolling, 100);
    					/*onwindowscroll*/ ctx[6]();
    				});

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*scroll*/ 16 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1$3.pageXOffset, /*scroll*/ ctx[4]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			if (dirty & /*title*/ 2) set_data_dev(t0, /*title*/ ctx[1]);

    			if (dirty & /*animation*/ 32 && h1_class_value !== (h1_class_value = "" + (null_to_empty(/*animation*/ ctx[5] ? "fade-in" : "") + " svelte-t5hwxm"))) {
    				attr_dev(h1, "class", h1_class_value);
    			}

    			if (dirty & /*animation, content*/ 33) {
    				each_value = /*content*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*id*/ 4) {
    				attr_dev(div0, "id", /*id*/ ctx[2]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_each(each_blocks, detaching);
    			/*div1_binding*/ ctx[7](null);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { content } = $$props;
    	let { title } = $$props;
    	let { id } = $$props;
    	let component;
    	let scroll;
    	let inView = false;
    	let animation = false;
    	const writable_props = ["content", "title", "id"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Resume> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Resume", $$slots, []);

    	function onwindowscroll() {
    		$$invalidate(4, scroll = window_1$3.pageYOffset);
    	}

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			component = $$value;
    			$$invalidate(3, component);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("id" in $$props) $$invalidate(2, id = $$props.id);
    	};

    	$$self.$capture_state = () => ({
    		content,
    		title,
    		id,
    		component,
    		scroll,
    		inView,
    		animation
    	});

    	$$self.$inject_state = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("id" in $$props) $$invalidate(2, id = $$props.id);
    		if ("component" in $$props) $$invalidate(3, component = $$props.component);
    		if ("scroll" in $$props) $$invalidate(4, scroll = $$props.scroll);
    		if ("inView" in $$props) $$invalidate(8, inView = $$props.inView);
    		if ("animation" in $$props) $$invalidate(5, animation = $$props.animation);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*scroll, component*/ 24) {
    			 $$invalidate(8, inView = scroll && component && component.getBoundingClientRect().top - window.innerHeight / 2 < 0);
    		}

    		if ($$self.$$.dirty & /*inView*/ 256) {
    			 if (inView) {
    				$$invalidate(5, animation = true);
    			}
    		}
    	};

    	return [content, title, id, component, scroll, animation, onwindowscroll, div1_binding];
    }

    class Resume$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { content: 0, title: 1, id: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Resume",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*content*/ ctx[0] === undefined && !("content" in props)) {
    			console.warn("<Resume> was created without expected prop 'content'");
    		}

    		if (/*title*/ ctx[1] === undefined && !("title" in props)) {
    			console.warn("<Resume> was created without expected prop 'title'");
    		}

    		if (/*id*/ ctx[2] === undefined && !("id" in props)) {
    			console.warn("<Resume> was created without expected prop 'id'");
    		}
    	}

    	get content() {
    		throw new Error("<Resume>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set content(value) {
    		throw new Error("<Resume>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<Resume>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Resume>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Resume>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Resume>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Components\Projects.svelte generated by Svelte v3.24.0 */

    const { window: window_1$4 } = globals;
    const file$6 = "src\\Components\\Projects.svelte";

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	return child_ctx;
    }

    function get_each_context_2$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[14] = list[i];
    	return child_ctx;
    }

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	child_ctx[10] = i;
    	return child_ctx;
    }

    // (28:20) {#each section.Content as paragraph}
    function create_each_block_2$1(ctx) {
    	let p;
    	let t_value = /*paragraph*/ ctx[14] + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			attr_dev(p, "class", "svelte-9ezx8q");
    			add_location(p, file$6, 28, 24, 1025);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && t_value !== (t_value = /*paragraph*/ ctx[14] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2$1.name,
    		type: "each",
    		source: "(28:20) {#each section.Content as paragraph}",
    		ctx
    	});

    	return block;
    }

    // (32:24) {#each section.Tags as tag}
    function create_each_block_1$1(ctx) {
    	let p;
    	let t_value = /*tag*/ ctx[11] + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			attr_dev(p, "class", "svelte-9ezx8q");
    			add_location(p, file$6, 32, 28, 1195);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && t_value !== (t_value = /*tag*/ ctx[11] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$1.name,
    		type: "each",
    		source: "(32:24) {#each section.Tags as tag}",
    		ctx
    	});

    	return block;
    }

    // (19:8) {#each content as section, index}
    function create_each_block$5(ctx) {
    	let div3;
    	let div0;
    	let img;
    	let img_src_value;
    	let img_alt_value;
    	let t0;
    	let div2;
    	let h2;
    	let t1_value = /*section*/ ctx[8].Title + "";
    	let t1;
    	let t2;
    	let t3;
    	let div1;
    	let t4;
    	let div3_class_value;
    	let each_value_2 = /*section*/ ctx[8].Content;
    	validate_each_argument(each_value_2);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_1[i] = create_each_block_2$1(get_each_context_2$1(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*section*/ ctx[8].Tags;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div0 = element("div");
    			img = element("img");
    			t0 = space();
    			div2 = element("div");
    			h2 = element("h2");
    			t1 = text(t1_value);
    			t2 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t3 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t4 = space();
    			if (img.src !== (img_src_value = "images/" + /*section*/ ctx[8].Image)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", img_alt_value = /*section*/ ctx[8].Title);
    			attr_dev(img, "class", "svelte-9ezx8q");
    			add_location(img, file$6, 23, 20, 776);
    			attr_dev(div0, "class", "image svelte-9ezx8q");
    			add_location(div0, file$6, 22, 16, 735);
    			attr_dev(h2, "class", "svelte-9ezx8q");
    			add_location(h2, file$6, 26, 20, 917);
    			attr_dev(div1, "class", "tags svelte-9ezx8q");
    			add_location(div1, file$6, 30, 20, 1094);
    			attr_dev(div2, "class", "content svelte-9ezx8q");
    			add_location(div2, file$6, 25, 16, 874);
    			set_style(div3, "--delay", 0.25 * (1 + /*index*/ ctx[10]) + "s");
    			attr_dev(div3, "class", div3_class_value = "shadow projects " + (/*animation*/ ctx[4] ? "fade-in" : "") + " svelte-9ezx8q");
    			add_location(div3, file$6, 19, 12, 586);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div0);
    			append_dev(div0, img);
    			append_dev(div3, t0);
    			append_dev(div3, div2);
    			append_dev(div2, h2);
    			append_dev(h2, t1);
    			append_dev(div2, t2);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div2, null);
    			}

    			append_dev(div2, t3);
    			append_dev(div2, div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			append_dev(div3, t4);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && img.src !== (img_src_value = "images/" + /*section*/ ctx[8].Image)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (dirty & /*content*/ 1 && img_alt_value !== (img_alt_value = /*section*/ ctx[8].Title)) {
    				attr_dev(img, "alt", img_alt_value);
    			}

    			if (dirty & /*content*/ 1 && t1_value !== (t1_value = /*section*/ ctx[8].Title + "")) set_data_dev(t1, t1_value);

    			if (dirty & /*content*/ 1) {
    				each_value_2 = /*section*/ ctx[8].Content;
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2$1(ctx, each_value_2, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_2$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div2, t3);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_2.length;
    			}

    			if (dirty & /*content*/ 1) {
    				each_value_1 = /*section*/ ctx[8].Tags;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty & /*animation*/ 16 && div3_class_value !== (div3_class_value = "shadow projects " + (/*animation*/ ctx[4] ? "fade-in" : "") + " svelte-9ezx8q")) {
    				attr_dev(div3, "class", div3_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$5.name,
    		type: "each",
    		source: "(19:8) {#each content as section, index}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let div1;
    	let h1;
    	let t0;
    	let h1_class_value;
    	let t1;
    	let div0;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[5]);
    	let each_value = /*content*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			h1 = element("h1");
    			t0 = text(/*title*/ ctx[1]);
    			t1 = space();
    			div0 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(h1, "class", h1_class_value = "" + (null_to_empty(/*animation*/ ctx[4] ? "fade-in" : "") + " svelte-9ezx8q"));
    			add_location(h1, file$6, 16, 4, 446);
    			attr_dev(div0, "class", "container svelte-9ezx8q");
    			add_location(div0, file$6, 17, 4, 506);
    			attr_dev(div1, "id", "Projects");
    			attr_dev(div1, "class", "center");
    			add_location(div1, file$6, 15, 0, 384);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, h1);
    			append_dev(h1, t0);
    			append_dev(div1, t1);
    			append_dev(div1, div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			/*div1_binding*/ ctx[6](div1);

    			if (!mounted) {
    				dispose = listen_dev(window_1$4, "scroll", () => {
    					scrolling = true;
    					clearTimeout(scrolling_timeout);
    					scrolling_timeout = setTimeout(clear_scrolling, 100);
    					/*onwindowscroll*/ ctx[5]();
    				});

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*scroll*/ 8 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1$4.pageXOffset, /*scroll*/ ctx[3]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			if (dirty & /*title*/ 2) set_data_dev(t0, /*title*/ ctx[1]);

    			if (dirty & /*animation*/ 16 && h1_class_value !== (h1_class_value = "" + (null_to_empty(/*animation*/ ctx[4] ? "fade-in" : "") + " svelte-9ezx8q"))) {
    				attr_dev(h1, "class", h1_class_value);
    			}

    			if (dirty & /*animation, content*/ 17) {
    				each_value = /*content*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$5(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_each(each_blocks, detaching);
    			/*div1_binding*/ ctx[6](null);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { content } = $$props;
    	let { title } = $$props;
    	let component;
    	let scroll;
    	let inView = false;
    	let animation = false;
    	const writable_props = ["content", "title"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Projects> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Projects", $$slots, []);

    	function onwindowscroll() {
    		$$invalidate(3, scroll = window_1$4.pageYOffset);
    	}

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			component = $$value;
    			$$invalidate(2, component);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    	};

    	$$self.$capture_state = () => ({
    		content,
    		title,
    		component,
    		scroll,
    		inView,
    		animation
    	});

    	$$self.$inject_state = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("component" in $$props) $$invalidate(2, component = $$props.component);
    		if ("scroll" in $$props) $$invalidate(3, scroll = $$props.scroll);
    		if ("inView" in $$props) $$invalidate(7, inView = $$props.inView);
    		if ("animation" in $$props) $$invalidate(4, animation = $$props.animation);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*scroll, component*/ 12) {
    			 $$invalidate(7, inView = scroll && component && component.getBoundingClientRect().top - window.innerHeight / 2 < 0);
    		}

    		if ($$self.$$.dirty & /*inView*/ 128) {
    			 if (inView) {
    				$$invalidate(4, animation = true);
    			}
    		}
    	};

    	return [content, title, component, scroll, animation, onwindowscroll, div1_binding];
    }

    class Projects$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { content: 0, title: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Projects",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*content*/ ctx[0] === undefined && !("content" in props)) {
    			console.warn("<Projects> was created without expected prop 'content'");
    		}

    		if (/*title*/ ctx[1] === undefined && !("title" in props)) {
    			console.warn("<Projects> was created without expected prop 'title'");
    		}
    	}

    	get content() {
    		throw new Error("<Projects>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set content(value) {
    		throw new Error("<Projects>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<Projects>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Projects>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Components\Contact.svelte generated by Svelte v3.24.0 */

    const file$7 = "src\\Components\\Contact.svelte";

    function get_each_context$6(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (16:4) {#each content as icon}
    function create_each_block$6(ctx) {
    	let a;
    	let div1;
    	let div0;
    	let img;
    	let img_src_value;
    	let img_alt_value;
    	let t;
    	let a_href_value;

    	const block = {
    		c: function create() {
    			a = element("a");
    			div1 = element("div");
    			div0 = element("div");
    			img = element("img");
    			t = space();
    			if (img.src !== (img_src_value = "images/" + /*icon*/ ctx[6].Image)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", img_alt_value = /*icon*/ ctx[6].Image);
    			attr_dev(img, "class", "svelte-1yc9omr");
    			add_location(img, file$7, 19, 20, 533);
    			attr_dev(div0, "class", "image svelte-1yc9omr");
    			add_location(div0, file$7, 18, 16, 492);
    			attr_dev(div1, "class", "icon svelte-1yc9omr");
    			add_location(div1, file$7, 17, 12, 456);
    			attr_dev(a, "href", a_href_value = /*icon*/ ctx[6].Link);
    			attr_dev(a, "target", "_blank");
    			add_location(a, file$7, 16, 8, 404);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, div1);
    			append_dev(div1, div0);
    			append_dev(div0, img);
    			append_dev(a, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*content*/ 1 && img.src !== (img_src_value = "images/" + /*icon*/ ctx[6].Image)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (dirty & /*content*/ 1 && img_alt_value !== (img_alt_value = /*icon*/ ctx[6].Image)) {
    				attr_dev(img, "alt", img_alt_value);
    			}

    			if (dirty & /*content*/ 1 && a_href_value !== (a_href_value = /*icon*/ ctx[6].Link)) {
    				attr_dev(a, "href", a_href_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$6.name,
    		type: "each",
    		source: "(16:4) {#each content as icon}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let div;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[2]);
    	let each_value = /*content*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$6(get_each_context$6(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "id", "Contact");
    			attr_dev(div, "class", "container svelte-1yc9omr");
    			add_location(div, file$7, 14, 0, 329);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			if (!mounted) {
    				dispose = listen_dev(window, "scroll", () => {
    					scrolling = true;
    					clearTimeout(scrolling_timeout);
    					scrolling_timeout = setTimeout(clear_scrolling, 100);
    					/*onwindowscroll*/ ctx[2]();
    				});

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*scroll*/ 2 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window.pageXOffset, /*scroll*/ ctx[1]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			if (dirty & /*content*/ 1) {
    				each_value = /*content*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$6(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$6(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { content } = $$props;
    	let component;
    	let scroll;
    	let inView = false;
    	let animation = false;
    	const writable_props = ["content"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Contact> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Contact", $$slots, []);

    	function onwindowscroll() {
    		$$invalidate(1, scroll = window.pageYOffset);
    	}

    	$$self.$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    	};

    	$$self.$capture_state = () => ({
    		content,
    		component,
    		scroll,
    		inView,
    		animation
    	});

    	$$self.$inject_state = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    		if ("component" in $$props) $$invalidate(5, component = $$props.component);
    		if ("scroll" in $$props) $$invalidate(1, scroll = $$props.scroll);
    		if ("inView" in $$props) $$invalidate(3, inView = $$props.inView);
    		if ("animation" in $$props) animation = $$props.animation;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*scroll*/ 2) {
    			 $$invalidate(3, inView = component && scroll > component.getBoundingClientRect().top);
    		}

    		if ($$self.$$.dirty & /*inView*/ 8) {
    			 if (inView) {
    				animation = true;
    			}
    		}
    	};

    	return [content, scroll, onwindowscroll];
    }

    class Contact$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { content: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Contact",
    			options,
    			id: create_fragment$7.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*content*/ ctx[0] === undefined && !("content" in props)) {
    			console.warn("<Contact> was created without expected prop 'content'");
    		}
    	}

    	get content() {
    		throw new Error("<Contact>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set content(value) {
    		throw new Error("<Contact>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Components\Footer.svelte generated by Svelte v3.24.0 */

    const file$8 = "src\\Components\\Footer.svelte";

    function create_fragment$8(ctx) {
    	let p;
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(/*content*/ ctx[0]);
    			attr_dev(p, "class", "svelte-1eqwghh");
    			add_location(p, file$8, 4, 0, 48);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*content*/ 1) set_data_dev(t, /*content*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { content } = $$props;
    	const writable_props = ["content"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Footer> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Footer", $$slots, []);

    	$$self.$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    	};

    	$$self.$capture_state = () => ({ content });

    	$$self.$inject_state = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [content];
    }

    class Footer$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { content: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Footer",
    			options,
    			id: create_fragment$8.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*content*/ ctx[0] === undefined && !("content" in props)) {
    			console.warn("<Footer> was created without expected prop 'content'");
    		}
    	}

    	get content() {
    		throw new Error("<Footer>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set content(value) {
    		throw new Error("<Footer>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\App.svelte generated by Svelte v3.24.0 */
    const file$9 = "src\\App.svelte";

    function create_fragment$9(ctx) {
    	let t0;
    	let header;
    	let nav;
    	let t1;
    	let banner;
    	let updating_scrollItem;
    	let t2;
    	let main;
    	let about;
    	let t3;
    	let education;
    	let t4;
    	let resume0;
    	let t5;
    	let resume1;
    	let t6;
    	let projects;
    	let t7;
    	let footer1;
    	let contact;
    	let t8;
    	let footer0;
    	let current;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowresize*/ ctx[2]);

    	nav = new Nav({
    			props: { content: /*content*/ ctx[0].NavItems },
    			$$inline: true
    		});

    	function banner_scrollItem_binding(value) {
    		/*banner_scrollItem_binding*/ ctx[3].call(null, value);
    	}

    	let banner_props = {
    		height: /*height*/ ctx[1],
    		content: /*content*/ ctx[0].MainBanner
    	};

    	if (/*content*/ ctx[0].NavItems[0] !== void 0) {
    		banner_props.scrollItem = /*content*/ ctx[0].NavItems[0];
    	}

    	banner = new Banner({ props: banner_props, $$inline: true });
    	binding_callbacks.push(() => bind(banner, "scrollItem", banner_scrollItem_binding));

    	about = new About({
    			props: {
    				title: /*content*/ ctx[0].AboutTitle,
    				content: /*content*/ ctx[0].About
    			},
    			$$inline: true
    		});

    	education = new Education({
    			props: {
    				title: /*content*/ ctx[0].EducationTitle,
    				content: /*content*/ ctx[0].Education
    			},
    			$$inline: true
    		});

    	resume0 = new Resume$1({
    			props: {
    				id: "Experience",
    				title: /*content*/ ctx[0].ExperienceTitle,
    				content: /*content*/ ctx[0].Resume
    			},
    			$$inline: true
    		});

    	resume1 = new Resume$1({
    			props: {
    				id: "Research",
    				title: /*content*/ ctx[0].ReseachTitle,
    				content: /*content*/ ctx[0].Research
    			},
    			$$inline: true
    		});

    	projects = new Projects$1({
    			props: {
    				title: /*content*/ ctx[0].ProjectsTitle,
    				content: /*content*/ ctx[0].Projects
    			},
    			$$inline: true
    		});

    	contact = new Contact$1({
    			props: { content: /*content*/ ctx[0].Contact },
    			$$inline: true
    		});

    	footer0 = new Footer$1({
    			props: { content: /*content*/ ctx[0].Footer },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			t0 = space();
    			header = element("header");
    			create_component(nav.$$.fragment);
    			t1 = space();
    			create_component(banner.$$.fragment);
    			t2 = space();
    			main = element("main");
    			create_component(about.$$.fragment);
    			t3 = space();
    			create_component(education.$$.fragment);
    			t4 = space();
    			create_component(resume0.$$.fragment);
    			t5 = space();
    			create_component(resume1.$$.fragment);
    			t6 = space();
    			create_component(projects.$$.fragment);
    			t7 = space();
    			footer1 = element("footer");
    			create_component(contact.$$.fragment);
    			t8 = space();
    			create_component(footer0.$$.fragment);
    			add_location(header, file$9, 19, 0, 642);
    			add_location(main, file$9, 24, 0, 805);
    			attr_dev(footer1, "class", "svelte-1pw70ph");
    			add_location(footer1, file$9, 32, 0, 1239);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, header, anchor);
    			mount_component(nav, header, null);
    			append_dev(header, t1);
    			mount_component(banner, header, null);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, main, anchor);
    			mount_component(about, main, null);
    			append_dev(main, t3);
    			mount_component(education, main, null);
    			append_dev(main, t4);
    			mount_component(resume0, main, null);
    			append_dev(main, t5);
    			mount_component(resume1, main, null);
    			append_dev(main, t6);
    			mount_component(projects, main, null);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, footer1, anchor);
    			mount_component(contact, footer1, null);
    			append_dev(footer1, t8);
    			mount_component(footer0, footer1, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(window, "resize", /*onwindowresize*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			const nav_changes = {};
    			if (dirty & /*content*/ 1) nav_changes.content = /*content*/ ctx[0].NavItems;
    			nav.$set(nav_changes);
    			const banner_changes = {};
    			if (dirty & /*height*/ 2) banner_changes.height = /*height*/ ctx[1];
    			if (dirty & /*content*/ 1) banner_changes.content = /*content*/ ctx[0].MainBanner;

    			if (!updating_scrollItem && dirty & /*content*/ 1) {
    				updating_scrollItem = true;
    				banner_changes.scrollItem = /*content*/ ctx[0].NavItems[0];
    				add_flush_callback(() => updating_scrollItem = false);
    			}

    			banner.$set(banner_changes);
    			const about_changes = {};
    			if (dirty & /*content*/ 1) about_changes.title = /*content*/ ctx[0].AboutTitle;
    			if (dirty & /*content*/ 1) about_changes.content = /*content*/ ctx[0].About;
    			about.$set(about_changes);
    			const education_changes = {};
    			if (dirty & /*content*/ 1) education_changes.title = /*content*/ ctx[0].EducationTitle;
    			if (dirty & /*content*/ 1) education_changes.content = /*content*/ ctx[0].Education;
    			education.$set(education_changes);
    			const resume0_changes = {};
    			if (dirty & /*content*/ 1) resume0_changes.title = /*content*/ ctx[0].ExperienceTitle;
    			if (dirty & /*content*/ 1) resume0_changes.content = /*content*/ ctx[0].Resume;
    			resume0.$set(resume0_changes);
    			const resume1_changes = {};
    			if (dirty & /*content*/ 1) resume1_changes.title = /*content*/ ctx[0].ReseachTitle;
    			if (dirty & /*content*/ 1) resume1_changes.content = /*content*/ ctx[0].Research;
    			resume1.$set(resume1_changes);
    			const projects_changes = {};
    			if (dirty & /*content*/ 1) projects_changes.title = /*content*/ ctx[0].ProjectsTitle;
    			if (dirty & /*content*/ 1) projects_changes.content = /*content*/ ctx[0].Projects;
    			projects.$set(projects_changes);
    			const contact_changes = {};
    			if (dirty & /*content*/ 1) contact_changes.content = /*content*/ ctx[0].Contact;
    			contact.$set(contact_changes);
    			const footer0_changes = {};
    			if (dirty & /*content*/ 1) footer0_changes.content = /*content*/ ctx[0].Footer;
    			footer0.$set(footer0_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(nav.$$.fragment, local);
    			transition_in(banner.$$.fragment, local);
    			transition_in(about.$$.fragment, local);
    			transition_in(education.$$.fragment, local);
    			transition_in(resume0.$$.fragment, local);
    			transition_in(resume1.$$.fragment, local);
    			transition_in(projects.$$.fragment, local);
    			transition_in(contact.$$.fragment, local);
    			transition_in(footer0.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(nav.$$.fragment, local);
    			transition_out(banner.$$.fragment, local);
    			transition_out(about.$$.fragment, local);
    			transition_out(education.$$.fragment, local);
    			transition_out(resume0.$$.fragment, local);
    			transition_out(resume1.$$.fragment, local);
    			transition_out(projects.$$.fragment, local);
    			transition_out(contact.$$.fragment, local);
    			transition_out(footer0.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(header);
    			destroy_component(nav);
    			destroy_component(banner);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(main);
    			destroy_component(about);
    			destroy_component(education);
    			destroy_component(resume0);
    			destroy_component(resume1);
    			destroy_component(projects);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(footer1);
    			destroy_component(contact);
    			destroy_component(footer0);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let height;
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("App", $$slots, []);

    	function onwindowresize() {
    		$$invalidate(1, height = window.innerHeight);
    	}

    	function banner_scrollItem_binding(value) {
    		NavItems[0] = value;
    		$$invalidate(0, content);
    	}

    	$$self.$capture_state = () => ({
    		About,
    		Education,
    		Nav,
    		Banner,
    		Resume: Resume$1,
    		content,
    		Projects: Projects$1,
    		Contact: Contact$1,
    		Footer: Footer$1,
    		height
    	});

    	$$self.$inject_state = $$props => {
    		if ("height" in $$props) $$invalidate(1, height = $$props.height);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [content, height, onwindowresize, banner_scrollItem_binding];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$9.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
