// news-modal-vue.js - Premium Vue.js Modal for News
(function() {
    'use strict';
    
    if (typeof Vue === 'undefined') {
        console.error('Vue.js не загружен!');
        return;
    }

    const { createApp } = Vue;

    const newsModalApp = createApp({
        data() {
            return {
                isOpen: false,
                title: '',
                content: '',
                image: '',
                source: '',
                date: '',
                link: '',
                categoryName: 'Новость',
                categoryIcon: 'bi bi-newspaper',
                categoryColor: '#667eea',
                isTranslated: false,
                isTranslating: false,
                originalData: null
            };
        },
        methods: {
            open(newsItem) {
                console.log('Opening premium news modal:', newsItem.title);
                
                // Prepare data
                this.title = newsItem.title || 'Без названия';
                this.content = this.formatContent(newsItem.fullDescription || newsItem.description);
                this.image = newsItem.image;
                this.source = newsItem.source || 'Источник';
                this.date = newsItem.formattedDate || 'Недавно';
                this.link = newsItem.link;
                
                // Category styling
                const categoryInfo = this.getCategoryInfo(newsItem.category);
                this.categoryName = categoryInfo.name;
                this.categoryIcon = categoryInfo.icon;
                this.categoryColor = newsItem.color || categoryInfo.color;
                
                // Store original for translation
                this.originalData = {
                    title: newsItem.title,
                    content: newsItem.fullDescription || newsItem.description
                };
                this.isTranslated = false;
                
                // Open modal
                this.isOpen = true;
                document.body.style.overflow = 'hidden';
            },
            
            close() {
                this.isOpen = false;
                document.body.style.overflow = '';
            },
            
            handleBackdropClick(event) {
                // Close only on direct backdrop click
                if (event.target.classList.contains('news-modal-premium-overlay')) {
                    this.close();
                }
            },
            
            handleImageError(event) {
                event.target.src = this.getPlaceholderImage();
            },
            
            async toggleTranslate() {
                if (this.isTranslating || !this.originalData) return;
                
                if (this.isTranslated) {
                    // Restore original
                    this.title = this.originalData.title;
                    this.content = this.formatContent(this.originalData.content);
                    this.isTranslated = false;
                } else {
                    // Translate
                    this.isTranslating = true;
                    
                    try {
                        const [translatedTitle, translatedContent] = await Promise.all([
                            this.translateText(this.originalData.title),
                            this.translateText(this.originalData.content)
                        ]);
                        
                        this.title = translatedTitle;
                        this.content = this.formatContent(translatedContent);
                        this.isTranslated = true;
                        
                        if (window.showNotification) {
                            window.showNotification('Текст переведён', 'success');
                        }
                    } catch (error) {
                        console.error('Translation error:', error);
                        if (window.showNotification) {
                            window.showNotification('Ошибка перевода', 'error');
                        }
                    } finally {
                        this.isTranslating = false;
                    }
                }
            },
            
            async translateText(text) {
                if (!text || text.length < 10) return text;
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|ru`;
                try {
                    const response = await fetch(url);
                    const contentType = response.headers.get('content-type') || '';
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    if (!contentType.includes('application/json')) {
                        console.warn('translateText: CORB or non-JSON response', url, 'Content-Type:', contentType);
                        throw new Error('Translation API returned non-JSON');
                    }
                    const data = await response.json();
                    if (data.responseData?.translatedText) {
                        return data.responseData.translatedText;
                    }
                    throw new Error('Translation failed');
                } catch (e) {
                    console.warn('translateText error:', url, e.message);
                    return text; // Возвращаем оригинал при ошибке
                }
            },
            
            formatContent(text) {
                if (!text) return '<p>Содержимое недоступно</p>';
                
                // Split into paragraphs and format
                const paragraphs = text.split('\n').filter(p => p.trim());
                return paragraphs.map(p => `<p>${this.escapeHtml(p)}</p>`).join('');
            },
            
            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            },
            
            getCategoryInfo(category) {
                const categories = {
                    'crypto': { 
                        name: 'Криптовалюты', 
                        icon: 'bi bi-currency-bitcoin',
                        color: '#f7931a'
                    },
                    'forex': { 
                        name: 'Форекс', 
                        icon: 'bi bi-currency-exchange',
                        color: '#10b981'
                    },
                    'general': { 
                        name: 'Общие новости', 
                        icon: 'bi bi-newspaper',
                        color: '#667eea'
                    },
                    'all': { 
                        name: 'Все новости', 
                        icon: 'bi bi-globe',
                        color: '#667eea'
                    }
                };
                return categories[category] || categories['general'];
            },
            
            getPlaceholderImage() {
                return `https://via.placeholder.com/1200x600/${this.categoryColor.replace('#', '')}/ffffff?text=News`;
            }
        },
        
        mounted() {
            console.log('✨ Premium news modal initialized');
            
            // Global access
            window.openNewsModalVue = (newsItem) => {
                this.open(newsItem);
            };
            
            // ESC key handler
            const handleEsc = (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            };
            
            document.addEventListener('keydown', handleEsc);
        }
    });

    const initModal = () => {
        const el = document.getElementById('newsModalApp');
        if (!el) {
            console.error('newsModalApp element not found');
            return;
        }
        
        try {
            newsModalApp.mount('#newsModalApp');
            console.log('Premium news modal mounted successfully');
        } catch (error) {
            console.error('Modal mount error:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModal);
    } else {
        initModal();
    }

})();
